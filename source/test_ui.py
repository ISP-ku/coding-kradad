"""
UI-only test app - skips real OAuth so you can preview the login, dashboard,
FAQ, and homework pages with fake data. Not the real app - use app.py once
you have real provider credentials set up.

Run:
    python source/test_ui.py
    PORT=8000 python source/test_ui.py   # override port
"""

import os
import socket
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Form, Request
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

BASE_DIR = Path(__file__).resolve().parent.parent
TEMPLATE_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="UI Test Mode")
app.add_middleware(SessionMiddleware, secret_key="test-only-not-secure")

if STATIC_DIR.is_dir():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

templates = Jinja2Templates(directory=str(TEMPLATE_DIR))

FAKE_USER = {
    "id": "123456789012345678",
    "username": "TestStudent",
    "avatar_url": "https://cdn.discordapp.com/embed/avatars/0.png",
}
FAKE_CLASSROOM_COURSES = [
    {"id": "111", "name": "Intro to Databases"},
    {"id": "222", "name": "Software Engineering Lab"},
]


@app.get("/")
async def index(request: Request):
    user = request.session.get("user")
    return templates.TemplateResponse(request, "index.html", {"user": user})


@app.get("/login/{provider}")
async def login(request: Request, provider: str):
    return RedirectResponse(str(request.url_for("fake_login", provider=provider)))


@app.get("/fake-login/{provider}")
async def fake_login(request: Request, provider: str):
    if provider not in ("discord", "google", "line"):
        provider = "discord"
    user = dict(FAKE_USER, provider=provider, email=None, classroom_courses=None)
    if provider == "google":
        user["email"] = "teststudent@example.com"
        user["classroom_courses"] = FAKE_CLASSROOM_COURSES
    request.session["user"] = user
    return RedirectResponse(str(request.url_for("dashboard")))


@app.get("/dashboard")
async def dashboard(request: Request):
    user = request.session.get("user")
    if not user:
        return RedirectResponse(str(request.url_for("index")))
    return templates.TemplateResponse(
        request, "dashboard.html", {"user": user, "has_faq": True, "has_homework": True}
    )


@app.get("/logout")
async def logout(request: Request):
    request.session.pop("user", None)
    return RedirectResponse(str(request.url_for("index")))


FAKE_FAQ_ENTRIES = [
    {
        "question": "When is the midterm project due?",
        "answer": "The midterm project is due Friday of Week 8, 23:59.",
        "status": "Published",
        "tags": ["deadline", "project"],
    },
    {
        "question": "Can we use a different database for the final project?",
        "answer": "Ask your lecturer for approval before switching database technology.",
        "status": "Published",
        "tags": ["project", "database"],
    },
    {
        "question": "Is attendance in lab sessions mandatory?",
        "answer": "",
        "status": "Pending",
        "tags": ["lab"],
    },
]


@app.get("/faq")
async def faq(request: Request, q: str = ""):
    query = q.strip().lower()
    if query:
        entries = [
            e for e in FAKE_FAQ_ENTRIES
            if query in e["question"].lower()
            or query in e["answer"].lower()
            or any(query in t.lower() for t in e["tags"])
        ]
    else:
        entries = FAKE_FAQ_ENTRIES
    return templates.TemplateResponse(request, "faq.html", {"entries": entries, "query": query})


@app.post("/faq/submit")
async def faq_submit(
    request: Request,
    question: str = Form(""),
    answer: str = Form(""),
    tags: str = Form(""),
):
    tag_list = [t.strip() for t in tags.split(",") if t.strip()]
    FAKE_FAQ_ENTRIES.append({
        "question": question,
        "answer": answer,
        "status": "Pending",
        "tags": tag_list,
    })
    return RedirectResponse(str(request.url_for("faq")), status_code=303)


FAKE_HOMEWORKS = [
    {"student": "TestStudent", "assignment": "HW1 - ER Diagram", "due_date": "2026-09-10", "status": "Submitted"},
    {"student": "TestStudent", "assignment": "HW2 - API Design", "due_date": "2026-09-17", "status": "Missing"},
    {"student": "TestStudent", "assignment": "HW0 - Setup", "due_date": "2026-08-30", "status": "Late"},
]
ASSIGNMENT_OPTIONS = ["HW1 - ER Diagram", "HW2 - API Design", "HW3 - Final Report"]


@app.get("/homework")
async def homework(request: Request):
    return templates.TemplateResponse(
        request,
        "homework.html",
        {"homeworks": FAKE_HOMEWORKS, "assignment_options": ASSIGNMENT_OPTIONS},
    )


@app.post("/homework/submit")
async def homework_submit(request: Request, assignment: str = Form("Unknown")):
    FAKE_HOMEWORKS.append({
        "student": FAKE_USER["username"],
        "assignment": assignment,
        "due_date": "-",
        "status": "Submitted",
    })
    return RedirectResponse(str(request.url_for("homework")), status_code=303)


def pick_port(host, preferred):
    """Fall back to another port if `preferred` is taken (e.g. macOS uses
    5000 for AirPlay Receiver by default)."""
    for port in (preferred, 5001, 5050, 8000, 8080):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            try:
                probe.bind((host, port))
                return port
            except OSError:
                continue
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind((host, 0))
        return probe.getsockname()[1]


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT") or 0) or pick_port(host, 5000)
    os.environ["PORT"] = str(port)

    if not TEMPLATE_DIR.is_dir():
        raise SystemExit(f"Cannot find the templates folder at {TEMPLATE_DIR}")

    print("Running in UI TEST MODE - no real login happens here.")
    print(f"Open http://localhost:{port} and click a button to see the fake-logged-in dashboard.")
    uvicorn.run("test_ui:app", host=host, port=port, reload=True)