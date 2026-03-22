Security & Functional Test Report: Academic Bulletin
System
Date: March 21, 2026
Status: Rigorous Testing Complete
Tested URL: https://academic-bulletin.vercel.app/login

1. Executive Summary
   This report details the findings of a comprehensive security and functional audit performed on
   the Academic Bulletin Review System. Testing focused on Role-Based Access Control
   (RBAC), Input Validation, and Core Business Logic.
   Critical Findings Summary
   Category
   Security
   RBAC
   Finding
   Stored Cross-Site Scripting
   (XSS) in School Name field.
   HOD can create/manage
   Programmes globally across
   all schools.
   Severity
   �
   �
   High
   �
   �
   Medium
   Functional
   UX/Logic
   Logout Exception:
   Client-side runtime error
   during session termination.
   Broken Submission Filter:
   School selection does not
   populate Programmes.
   �
   �
   High
   �
   �
   High
2. "Things That Shouldn't Be Allowed" (Security & RBAC)
   2.1 Stored Cross-Site Scripting (XSS)
   ● Vulnerability: The Name field in the "Add School" modal does not sanitize HTML input.
   ● Proof of Concept: Inputting <script>alert('xss')</script> as a school name
   results in the script executing when the Schools table is viewed by an Admin.
   ● Risk: An attacker (or a malicious HOD if they gain access) could inject scripts to steal
   session cookies or perform actions on behalf of the Admin.
   2.2 RBAC Overreach: Global Programme Creation
   ● Vulnerability: The Head of Department (HOD) role has access to the "Add Programme"
   button.
   ● Observation: While HODs should manage their own department, the system allows
   them to select any school and any department to create a programme.
   ● Risk: Data integrity issues where HODs from "Science" can create programmes in "Arts"
   or "Engineering" without oversight.
   2.3 URL Manipulation (Direct Navigation)
   ● Vulnerability: While the UI hides the "Users" link from HODs, direct navigation to
   /users was tested.
   ● Status: Pass. The system correctly redirects or blocks access to restricted routes via
   URL manipulation.
3. "Things That Shouldn't Be So" (Functional & UX)
   3.1 Critical Logout Exception
   ● Issue: Clicking "Log out" triggers a Runtime Error: A client-side exception
   has occurred.
   ● Impact: Users are left on a blank error page instead of the login screen. This indicates a
   failure in state cleanup or a routing loop in the frontend (Next.js/React).
   3.2 Broken Submission Workflow
   ● Issue: In the "New Submission" screen, selecting a School from the dropdown does not
   trigger the loading of associated Programmes.
   ● Impact: The "Select a programme" dropdown remains empty or unresponsive, making it
   impossible to complete a submission. This is a "blocker" for the application's core
   purpose.
   3.3 Lack of Transactional Feedback
   ● Issue: When creating a School or Department, the modal often closes without a
   "Success" toast or confirmation message.
   ● Impact: Users are forced to manually refresh or check the table to see if their action was
   successful, leading to a poor user experience.
4. Recommendations for Hardening
5. Sanitize All Inputs: Use a library like DOMPurify on the frontend and strict validation
   on the backend to strip HTML tags from all text inputs.
6. Fix State Persistence: Debug the logout function to ensure all local storage/cookies
   are cleared before the redirect to prevent the client-side crash.
7. Implement Scoped Permissions: Restrict HOD actions so they can only interact with
   the DepartmentID assigned to their user profile.
8. Repair Reactive Selectors: Ensure the onValueChange event in the Submission form
   correctly updates the state of dependent dropdowns.
   End of Report
