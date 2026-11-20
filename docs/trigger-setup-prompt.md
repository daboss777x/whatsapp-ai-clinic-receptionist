# Trigger.dev project setup prompt

How to use: open Claude Code in the folder you want to set up, then paste
everything below the line into the chat. It works in an empty folder or an
existing project.

---

Set up THIS folder for building Trigger.dev automations. Work only inside this
folder. Do these in order:

1. Login: Run `npx trigger.dev@latest login` yourself (in the background or
   with a long timeout, since it waits for me). It should open a browser tab;
   if it doesn't, open the URL it prints with `open <url>`. Tell me to approve
   it in the browser, wait until the CLI confirms I'm logged in, then continue.
   This login is all development needs; no Trigger.dev keys go in .env.

   Project: Check whether this folder is already a Trigger.dev project
   (trigger.config.ts, package.json with the Trigger.dev SDK). If not, set one
   up with the latest trigger.dev CLI (init), using TypeScript and tasks in
   src/trigger/. Tell me if I need to pick a project in the browser.

2. MCP: Install the Trigger.dev MCP server for this project (use the latest
   trigger.dev CLI, not a pinned version). Tell me if I need to restart Claude
   Code, and confirm with /mcp that it's connected.

3. Research: Do a short web search of the official Trigger.dev docs and
   changelog to find the LATEST SDK version (don't assume v4). Use only that
   version's syntax and ignore older examples.

4. Reference file: Create .claude/commands/trigger-ref.md with short, correct
   examples for: basic task, scheduled task, schema task, triggering from inside
   a task, idempotency keys, waits, retries, and the checker + processor pattern.
   Note the SDK version and date at the top.

5. CLAUDE.md: Create CLAUDE.md if it doesn't exist. Add a short Trigger.dev
   section with a few researched rules for each topic (tasks, schedules,
   triggering, waits, env vars, deploying), plus common mistakes to avoid and
   which MCP tool to use for what. Link to trigger-ref.md instead of copying
   the examples. Keep it brief, and don't change any other sections. This is for
   use throughout this project.

6. Env: Create .env if it doesn't exist and make sure .gitignore includes it.
   Leave it empty for now: each automation's own keys (OpenAI, Slack, etc.) get
   added when that automation is built, and also go in the Trigger.dev
   dashboard (Environment Variables → Production). Never ask me to paste keys
   into the chat, and never print them.

7. Test: Start the dev server, build a tiny hello-world task, run it, and show
   me the result to prove everything is connected.

8. Production (only when I say I'm ready to go live, not during setup):
   Production deploys through Trigger.dev's GitHub integration: every push to
   the main branch deploys automatically. No GitHub Actions or deploy token.

   a. GitHub app: Tell me to open the Trigger.dev dashboard → this project →
      Project settings → GitHub (open the page for me with `open <url>`) and
      check the Trigger.dev GitHub app is installed for my account. Wait until
      I confirm it is.

   b. Repo: Check `gh auth status` (tell me to run `gh auth login` if needed).
      - If this folder already has a GitHub remote, use that repo.
      - If not, tell me the name you'll use, then create a PRIVATE repo with
        `gh repo create <name> --private --source . --push`.
      Before any push, confirm .env is gitignored and no secrets are in the
      files being committed. Ask me before creating the repo or pushing.

   c. Connect: Open this project's Trigger.dev settings → GitHub page for me
      with `open <url>`, then tell me exactly what to click: select this repo
      (give me its name) and set the production tracking branch to main.
      Wait until I confirm.

   d. Env vars: Copy all of .env to my clipboard with `pbcopy < .env` (never
      print the values), and list just the key names so I know what's in it.
      Then tell me: in the Trigger.dev dashboard, click Environment Variables
      in the left panel → Add new → paste everything at once → tick both
      Development and Production → save. Wait until I confirm.

   e. Verify: Push to main, then use the MCP tools to check the deployment
      finished and trigger a test run in production. Show me the result.
