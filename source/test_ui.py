"""
UI-only test app — skips Discord OAuth entirely so you can preview the
login page and dashboard with fake data.

This is NOT the real app. It's just for looking at the UI before you
set up Discord credentials. Once you're happy with the look, use app.py
(the real OAuth version) instead.

Run:
    python test_ui.py

Then open http://localhost:5000
"""

from flask import Flask, render_template, redirect, url_for, session, request

app = Flask(__name__)
app.secret_key = "test-only-not-secure"

# Fake user, standing in for what Discord would normally return
FAKE_USER = {
    "id": "123456789012345678",
    "username": "TestStudent",
    "discriminator": "0001",
    "avatar_url": "https://cdn.discordapp.com/embed/avatars/0.png",  # Discord's default placeholder avatar
}


@app.route("/")
def index():
    user = session.get("user")
    return render_template("index.html", user=user)


@app.route("/login")
def login():
    """Same route name as the real app, so index.html's link works unchanged."""
    return redirect(url_for("fake_login"))


@app.route("/fake-login")
def fake_login():
    """Pretend Discord just approved the login and sent back a profile."""
    session["user"] = FAKE_USER
    return redirect(url_for("dashboard"))


@app.route("/dashboard")
def dashboard():
    user = session.get("user")
    if not user:
        return redirect(url_for("index"))
    return render_template("dashboard.html", user=user)


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
    """UI test only — doesn't actually save anything, just shows the flow."""
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
    """UI test only — doesn't actually store the file, just shows the flow."""
    assignment = request.form.get("assignment", "Unknown")
    FAKE_HOMEWORKS.append({
        "student": FAKE_USER["username"],
        "assignment": assignment,
        "due_date": "-",
        "status": "Submitted",
    })
    return redirect(url_for("homework"))


if __name__ == "__main__":
    print("Running in UI TEST MODE — no real Discord login happens here.")
    print("Open http://localhost:5000 and click the button to see the fake-logged-in dashboard.")
    app.run(debug=True, port=5000)
