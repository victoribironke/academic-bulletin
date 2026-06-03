import os
import logging
import json
import io
from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel
from PIL import Image

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("GRACE-Vision")

app = FastAPI(title="GRACE Administration Compliance")

GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
TOGETHER_API_KEY = os.environ.get("TOGETHER_API_KEY")
HF_TOKEN = os.environ.get("HF_TOKEN")

google_model = None
if GOOGLE_API_KEY:
    try:
        import google.generativeai as genai
        genai.configure(api_key=GOOGLE_API_KEY)
        google_model = genai.GenerativeModel("gemini-2.5-flash")
        logger.info("✓ Tier 1 ready: Google Gemini 2.5 Flash")
    except Exception as e:
        logger.warning(f"✗ Tier 1 init failed: {e}")
else:
    logger.info("– Tier 1 skipped: GOOGLE_API_KEY not set")

together_client = None
TOGETHER_MODEL = "meta-llama/Meta-Llama-3-8B-Instruct-Lite"
if TOGETHER_API_KEY:
    try:
        from together import Together
        together_client = Together(api_key=TOGETHER_API_KEY)
        logger.info(f"✓ Tier 2 ready: Together AI ({TOGETHER_MODEL})")
    except Exception as e:
        logger.warning(f"✗ Tier 2 init failed: {e}")
else:
    logger.info("– Tier 2 skipped: TOGETHER_API_KEY not set")

GEMMA_MODEL_ID = "google/gemma-4-e4b-it"
local_pipeline = None


def get_local_pipeline():
    global local_pipeline
    if local_pipeline is None:
        logger.info(f"Loading local model: {GEMMA_MODEL_ID} (this may take a few minutes)...")
        try:
            import torch
            from transformers import pipeline

            local_pipeline = pipeline(
                "text-generation",
                model=GEMMA_MODEL_ID,
                torch_dtype=torch.bfloat16,
                device_map="cpu",
                token=HF_TOKEN,
            )
            logger.info(f"✓ Tier 3 loaded: {GEMMA_MODEL_ID}")
        except Exception as e:
            logger.error(f"✗ Tier 3 load failed: {e}")
            raise
    return local_pipeline


SYSTEM_PROMPT = (
    "You are a specialized institutional compliance auditor for Babcock University. "
    "Output ONLY valid JSON."
)

def clean_json(raw_str: str) -> str:
    raw_str = raw_str.strip()
    if raw_str.startswith("```json"):
        raw_str = raw_str[len("```json"):].strip()
    elif raw_str.startswith("```"):
        raw_str = raw_str[3:].strip()
    if raw_str.endswith("```"):
        raw_str = raw_str[:-3].strip()
    return raw_str


def repair_json(raw_str: str) -> str:
    """Attempt to repair common JSON issues like unterminated strings."""
    import re
    raw_str = raw_str.strip()
    # Try to fix unterminated strings by closing open quotes and braces
    open_braces = raw_str.count('{') - raw_str.count('}')
    open_brackets = raw_str.count('[') - raw_str.count(']')
    # Count unescaped quotes to check for unterminated strings
    in_string = False
    last_char = ''
    for ch in raw_str:
        if ch == '"' and last_char != '\\':
            in_string = not in_string
        last_char = ch
    # If we're inside an unterminated string, close it
    if in_string:
        raw_str += '"'
    # Close any open brackets/braces
    raw_str += ']' * open_brackets
    raw_str += '}' * open_braces
    return raw_str



class CourseDescription(BaseModel):
    title: str
    content: str


class PillarEvaluation(BaseModel):
    score: int
    summary: str


class GraceResponse(BaseModel):
    G_Global_Relevance: PillarEvaluation
    R_Research_Focus: PillarEvaluation
    A_Adventist_Rooted: PillarEvaluation
    C_Competent_Community: PillarEvaluation
    E_Entrepreneurship: PillarEvaluation
    Vision_Alignment_Summary: str

class ImageEvaluation(BaseModel):
    result: str
    reason: str


def create_grace_prompt(title: str, content: str) -> str:
    return f"""Evaluate if this course description aligns with the Administration's GRACE vision.

GRACE PILLARS:
- G (Global Relevance): Prepares students for international impact/standards.
- R (Research Focus): Emphasizes inquiry, data, and evidence-based learning.
- A (Adventist Rooted): Integrates faith, holistic values (Head, Heart, Hand), and service.
- C (Competent Community): Fosters professional skill-sharing and community upliftment.
- E (Entrepreneurship): Encourages innovation, self-reliance, and a business mindset.

SCORING RUBRIC:
- 0: No relevance or mention whatsoever.
- 1: Very loose or highly theoretical connection; not an actual focus.
- 2: Minor connection exists, but it's an accidental byproduct rather than an objective.
- 3: Moderate connection; explicitly mentioned but not a major focus.
- 4: Strong connection; the pillar is explicitly stated and integrated as a core component of the course.
- 5: Exceptional alignment; the course perfectly exemplifies the pillar as a primary, undeniable focus.

DIRECTIVE: Be highly strict. DO NOT award high scores (3, 4, or 5) unless the course description explicitly contains language and goals directly validating that pillar. Do not assume or extrapolate.
## NOTE:  FAIL EVERYTHING THAT DOES NOT MEET THE MINIMUM REQUIREMENT OF 150 WORDS AND EVERY CHECK HAS TO BE VERY VERY STRICT IN THE SENSE THAT GRACE SHOULDNT JUST BE SPELT OUT BUT MUST BE EMBODIED IN WHATEVER IS INPUTED. 
Course Title: {title}
Description: "{content}"

Task: provide a score (0-5) for each pillar and a brief "Vision Alignment" summary.
Format: JSON only.
JSON:"""


def infer_google(prompt: str) -> str:
    response = google_model.generate_content(
        f"{SYSTEM_PROMPT}\n\n{prompt}",
        generation_config={
            "temperature": 0.1, 
            "max_output_tokens": 8192,
            "response_mime_type": "application/json",
            "response_schema": GraceResponse
        },
    )
    return response.text.strip()


def infer_together(prompt: str) -> str:
    response = together_client.chat.completions.create(
        model=TOGETHER_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        max_tokens=1024,
        temperature=0.1,
        response_format={"type": "json_object"}
    )
    return response.choices[0].message.content.strip()


def infer_local_gemma(prompt: str) -> str:
    pipe = get_local_pipeline()
    full_prompt = f"{SYSTEM_PROMPT}\n\n{prompt}"
    output = pipe(full_prompt, max_new_tokens=1024, do_sample=False, return_full_text=False)
    return output[0]["generated_text"].strip()


@app.post("/check-grace")
def check_vision(data: CourseDescription):
    if not data.content.strip():
        raise HTTPException(status_code=400, detail="Description is empty")

    prompt = create_grace_prompt(data.title, data.content)

    tiers = []
    if google_model:
        tiers.append(("Google Gemini 2.5 Flash", infer_google))
    if together_client:
        tiers.append((f"Together AI ({TOGETHER_MODEL})", infer_together))
    if HF_TOKEN:
        tiers.append((f"Local Gemma 4 ({GEMMA_MODEL_ID})", infer_local_gemma))

    if not tiers:
        raise HTTPException(
            status_code=503,
            detail="No AI backends configured. Set GOOGLE_API_KEY, TOGETHER_API_KEY, or HF_TOKEN.",
        )

    last_error = None
    for tier_name, tier_fn in tiers:
        try:
            logger.info(f"Attempting inference via: {tier_name}")
            raw_result = tier_fn(prompt)
            
            try:
                cleaned_result = clean_json(raw_result)
                analysis_obj = json.loads(cleaned_result)
            except Exception as json_err:
                logger.warning(f"Failed to parse JSON from {tier_name}: {json_err}")
                logger.warning(f"RAW RESULT: {repr(raw_result)}")
                analysis_obj = raw_result

            logger.info(f"Success via: {tier_name}")
            return {"analysis": analysis_obj, "model_used": tier_name}
        except Exception as e:
            logger.warning(f"{tier_name} failed: {e}")
            last_error = e

    raise HTTPException(
        status_code=500,
        detail=f"All AI tiers failed. Last error: {str(last_error)}",
    )


@app.post("/check-image")
async def check_image(file: UploadFile = File(...)):
    if not google_model:
        raise HTTPException(
            status_code=503,
            detail="Image evaluation requires Tier 1 (Google Gemini 2.5 Flash) to be configured via GOOGLE_API_KEY."
        )

    # Validate file type
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image.")

    try:
        # Read the file contents and convert to a PIL image
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))

        # Convert to RGB if necessary (e.g. RGBA pngs)
        if image.mode != "RGB":
            image = image.convert("RGB")

        prompt = (
            "You are a professional content auditor for an institutional bulletin. "
            "Evaluate if this image is professional and fit for submission in an official, high-quality university bulletin. "
            "It should be in focus, appropriately framed, visually pleasing, and suitable for a professional academic context. "
            "IT SHOULD NOT BE BLURRY BUT CLEAR. IT SHOULD BE A PORTRAIT. IT SHOULD HAVE A SUITABLE BACKGROUND. "
            "IF IT DOES NOT MEET ANY OF THESE REQUIREMENTS IT SHOULD FAIL AND THE REASON SHOULD BE EXPLAINED. "
            "Return the result as 'pass' or 'fail', and explain your reasoning."
        )

        logger.info("Attempting multimodal inference for image evaluation...")
        
        # Execute multimodal API call
        response = google_model.generate_content(
            [prompt, image],
            generation_config={
                "temperature": 0.2, 
                "max_output_tokens": 1024,
                "response_mime_type": "application/json",
                "response_schema": ImageEvaluation
            },
        )
        
        raw_result = response.text.strip()
        cleaned_result = clean_json(raw_result)
        
        try:
            analysis_obj = json.loads(cleaned_result)
        except json.JSONDecodeError as json_err:
            logger.warning(f"Initial JSON parse failed: {json_err}")
            logger.warning(f"RAW RESULT: {repr(raw_result)}")
            # Attempt to repair the malformed JSON
            try:
                repaired = repair_json(cleaned_result)
                analysis_obj = json.loads(repaired)
                logger.info("JSON successfully repaired")
            except json.JSONDecodeError:
                # Last resort: return a structured fallback from the raw text
                logger.warning("JSON repair failed, returning structured fallback")
                raw_lower = raw_result.lower()
                result = "fail" if "fail" in raw_lower else "pass"
                analysis_obj = {"result": result, "reason": raw_result}
        
        logger.info("Successful multimodal image evaluation via Google Gemini 2.5 Flash")
        return {"analysis": analysis_obj, "model_used": "Google Gemini 2.5 Flash"}

    except Exception as e:
        logger.error(f"Image evaluation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Image evaluation failed: {str(e)}")


@app.get("/")
def health():
    return {
        "status": "GRACE Vision AI Online",
        "architecture": "3-tier fallback",
        "tiers": {
            "tier_1": {
                "name": "Google Gemini 2.5 Flash",
                "ready": google_model is not None,
            },
            "tier_2": {
                "name": f"Together AI ({TOGETHER_MODEL})",
                "ready": together_client is not None,
            },
            "tier_3": {
                "name": f"Local Gemma 4 ({GEMMA_MODEL_ID})",
                "ready": HF_TOKEN is not None,
                "loaded": local_pipeline is not None,
            },
        },
    }