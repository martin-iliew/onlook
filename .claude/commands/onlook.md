Open the Onlook visual editor so the designer can make visual changes to the current project.

Steps:
1. Tell the user: "Opening Onlook visual editor..."
2. Run this command to open the browser: `start http://localhost:3000` (Windows) or `open http://localhost:3000` (Mac/Linux)
3. Wait for the user to confirm they are done with visual editing
4. After they return, use the Read tool to check which files were recently modified: `git diff --name-only`
5. Show the user a summary of what was changed visually
6. Offer to continue working on those files

Note: Onlook must be running locally (`bun run dev:cc` from the repo root).
