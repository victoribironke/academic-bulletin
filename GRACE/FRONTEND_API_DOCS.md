# GRACE Vision AI - Frontend API Documentation

This backend exposes endpoints for evaluating university courses according to the GRACE rubric, as well as evaluating images to ensure they meet professional institutional standards.

*Base URL: The URL of the Hugging Face Space (or localhost:7860 during local development).*

---

## 1. Evaluate Course Description
Analyzes a course title and description to score it against the GRACE pillars.

**Endpoint:** `POST /check-grace`  
**Content-Type:** `application/json`

### Request Body
| Field | Type | Description |
| :--- | :--- | :--- |
| `title` | `string` | The title of the course. |
| `content` | `string` | The detailed course description/syllabus. |

**Example Frontend Request (Fetch API):**
```javascript
const response = await fetch("https://[YOUR_HF_SPACE_URL]/check-grace", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    title: "Introduction to Data Science",
    content: "This course covers statistical methods..."
  })
});

const data = await response.json();
console.log(data.analysis.Vision_Alignment_Summary);
```

### JSON Response Structure
The response contains an `analysis` object and the `model_used`.
```json
{
  "analysis": {
    "G_Global_Relevance": { "score": 5, "summary": "..." },
    "R_Research_Focus": { "score": 5, "summary": "..." },
    "A_Adventist_Rooted": { "score": 0, "summary": "..." },
    "C_Competent_Community": { "score": 2, "summary": "..." },
    "E_Entrepreneurship": { "score": 4, "summary": "..." },
    "Vision_Alignment_Summary": "Overall summary..."
  },
  "model_used": "Google Gemini 2.5 Flash"
}
```

---

## 2. Professional Image Evaluation (NEW)
Uses a multimodal AI to analyze an uploaded image and determine if it is professional and fit for submission in an official university bulletin.

**Endpoint:** `POST /check-image`  
**Content-Type:** `multipart/form-data`

> [!IMPORTANT]
> Because you are sending an actual file, **do not** set the `Content-Type` header manually in JavaScript. Let the browser or Axios set it automatically so the multipart boundary is generated correctly. Formats like JPG, PNG, WEBP are supported.

### Request Body
You must send a `FormData` object with a single field named `file` containing the binary image file.

**Example Frontend Request (React / Vanilla JS):**
```javascript
// Assuming you have an <input type="file" id="imageInput" />
const fileInput = document.getElementById('imageInput');
const file = fileInput.files[0];

if (!file) return;

const formData = new FormData();
formData.append("file", file);

const response = await fetch("https://[YOUR_HF_SPACE_URL]/check-image", {
  method: "POST",
  // Notice: NO headers object. The browser sets 'multipart/form-data' automatically.
  body: formData
});

const data = await response.json();
console.log(data.analysis.result); // "pass" or "fail"
console.log(data.analysis.reason); // "The image is out of focus..."
```

### JSON Response Structure
The model evaluates the image and returns a strict "pass" or "fail", along with its reasoning.
```json
{
  "analysis": {
    "result": "pass",
    "reason": "The image is well-lit, clearly in focus, and features professional attire suitable for an academic bulletin."
  },
  "model_used": "Google Gemini 2.5 Flash"
}
```

### Error Handling
- **`400 Bad Request`**: If the uploaded file is not an image (e.g. passing a PDF or text file).
- **`503 Service Unavailable`**: If the system's primary Tier 1 multimodal model (Google Gemini) is unconfigured or offline.
