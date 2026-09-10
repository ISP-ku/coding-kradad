"""
UI-only test app - skips Discord OAuth entirely so you can preview the
login page and dashboard with fake data.

This is NOT the real app. It's just for looking at the UI before you
set up Discord credentials. Once you're happy with the look, use app.py
(the real OAuth version) instead.

Run (Windows / macOS / Linux, from anywhere in the project):
    python source/test_ui.py        # Windows: py source\test_ui.py

The URL to open is printed when it starts. Set PORT or HOST to override:
    PORT=8000 python source/test_ui.py          # macOS / Linux
    set PORT=8000 && py source\test_ui.py       # Windows cmd
"""

import os
import socket
from pathlib import Path

from flask import Flask, render_template, redirect, url_for, session, request

# templates/ sits at the project root, one level above source/. Building the
# path from __file__ keeps it correct no matter which folder you run from,
# and pathlib picks the right separator for Windows vs macOS/Linux.
BASE_DIR = Path(__file__).resolve().parent.parent
TEMPLATE_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

app = Flask(__name__, template_folder=str(TEMPLATE_DIR), static_folder=str(STATIC_DIR))
app.secret_key = "test-only-not-secure"

# Fake profile, standing in for what each real provider would normally return.
# index.html now has 3 login buttons (Discord/Google/LINE), each linking to
# url_for('login', provider=...) - same route signature app.py uses - so this
# fake version accepts (and ignores) the provider except to color the preview.
FAKE_USER = {
    "id": "123456789012345678",
    "username": "TestStudent",
    "avatar_url": "https://cdn.discordapp.com/embed/avatars/0.png",  # Discord's default placeholder avatar
}
FAKE_CLASSROOM_COURSES = [
    {"id": "111", "name": "Intro to Databases"},
    {"id": "222", "name": "Software Engineering Lab"},
]


@app.route("/")
def index():
    user = session.get("user")
    return render_template("index.html", user=user)


@app.route("/login/<provider>")
def login(provider):
    """Same route signature as the real app, so index.html's links work unchanged."""
    return redirect(url_for("fake_login", provider=provider))


@app.route("/fake-login/<provider>")
def fake_login(provider):
    """Pretend <provider> just approved the login and sent back a profile."""
    if provider not in ("discord", "google", "line"):
        provider = "discord"
    user = dict(FAKE_USER, provider=provider, email=None, classroom_courses=None)
    if provider == "google":
        user["email"] = "teststudent@example.com"
        user["classroom_courses"] = FAKE_CLASSROOM_COURSES
    session["user"] = user
    return redirect(url_for("dashboard"))


@app.route("/dashboard")
def dashboard():
    user = session.get("user")
    if not user:
        return redirect(url_for("index"))
    return render_template("dashboard.html", user=user, has_faq=True, has_homework=True)


@app.route("/logout")
def logout():
    session.pop("user", None)
    return redirect(url_for("index"))


# ---- Fake data for FAQ / Issue page (SRS-16 to SRS-18) ----
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


@app.route("/faq")
def faq():
    query = request.args.get("q", "").strip().lower()
    if query:
        entries = [
            e for e in FAKE_FAQ_ENTRIES
            if query in e["question"].lower()
            or query in e["answer"].lower()
            or any(query in t.lower() for t in e["tags"])
        ]
    else:
        entries = FAKE_FAQ_ENTRIES
    return render_template("faq.html", entries=entries, query=query)


@app.route("/faq/submit", methods=["POST"])
def faq_submit():
    """UI test only - doesn't actually save anything, just shows the flow."""
    question = request.form.get("question", "")
    answer = request.form.get("answer", "")
    tags_raw = request.form.get("tags", "")
    tags = [t.strip() for t in tags_raw.split(",") if t.strip()]

    FAKE_FAQ_ENTRIES.append({
        "question": question,
        "answer": answer,
        "status": "Pending",
        "tags": tags,
    })
    return redirect(url_for("faq"))


# ---- Fake data for Homework Collector page ----
FAKE_HOMEWORKS = [
    {"student": "TestStudent", "assignment": "HW1 - ER Diagram", "due_date": "2026-09-10", "status": "Submitted"},
    {"student": "TestStudent", "assignment": "HW2 - API Design", "due_date": "2026-09-17", "status": "Missing"},
    {"student": "TestStudent", "assignment": "HW0 - Setup", "due_date": "2026-08-30", "status": "Late"},
]
ASSIGNMENT_OPTIONS = ["HW1 - ER Diagram", "HW2 - API Design", "HW3 - Final Report"]


@app.route("/homework")
def homework():
    return render_template(
        "homework.html",
        homeworks=FAKE_HOMEWORKS,
        assignment_options=ASSIGNMENT_OPTIONS,
    )


@app.route("/homework/submit", methods=["POST"])
def homework_submit():
    """UI test only - doesn't actually store the file, just shows the flow."""
    assignment = request.form.get("assignment", "Unknown")
    FAKE_HOMEWORKS.append({
        "student": FAKE_USER["username"],
        "assignment": assignment,
        "due_date": "-",
        "status": "Submitted",
    })
    return redirect(url_for("homework"))


def pick_port(host, preferred):
    """Return a port we can actually bind to.

    macOS gives port 5000 to AirPlay Receiver by default, so the usual Flask
    port is often taken there. Rather than crash, fall back to the next free
    one. No SO_REUSEADDR here on purpose: on Windows it would let us bind a
    port that is already in use and report a busy port as free.
    """
    for port in (preferred, 5001, 5050, 8000, 8080):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            try:
                probe.bind((host, port))
                return port
            except OSError:
                continue
    # Everything we tried was busy: ask the OS for any free port.
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind((host, 0))
        return probe.getsockname()[1]


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    # Remember the chosen port in the environment so the debug reloader
    # restarts on the same one instead of hopping to a new port.
    port = int(os.environ.get("PORT") or 0) or pick_port(host, 5000)
    os.environ["PORT"] = str(port)

    if not TEMPLATE_DIR.is_dir():
        raise SystemExit(f"Cannot find the templates folder at {TEMPLATE_DIR}")

    print("Running in UI TEST MODE - no real Discord login happens here.")
    print(f"Open http://localhost:{port} and click the button to see the fake-logged-in dashboard.")
    app.run(debug=True, host=host, port=port)
