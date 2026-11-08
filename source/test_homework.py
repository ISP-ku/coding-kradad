"""Homework feature: lecturer assigns, students submit, TAs grade.

Signs in through the real login flow (fixtures shared with test_rbac.py), so
the roles and sessions are the real ones; nothing is overridden.
"""
import pytest

from test_rbac import anon, isolated, sign_in  # noqa: F401  (pytest fixtures)

HW = {"course_id": "01219245", "title": "HW1 - ER Diagram", "description": "Draw the ERD.",
      "due_at": "2099-01-01T09:00:00+07:00", "max_score": 20}
PAST = {**HW, "title": "HW0 - Setup", "due_at": "2020-01-01T09:00:00Z"}


def assign(lecturer, **overrides):
    response = lecturer.post("/api/homework", json={**HW, **overrides})
    assert response.status_code == 201, response.text
    return response.json()


def by_title(client):
    response = client.get("/api/homework")
    assert response.status_code == 200
    return {h["title"]: h for h in response.json()}


# --- Lecturer assigns ---------------------------------------------------------

def test_lecturer_assigns_homework_everyone_sees_it(sign_in):
    lecturer, ta, student = sign_in("lecturer"), sign_in("ta"), sign_in("student")
    created = assign(lecturer)
    assert created["title"] == HW["title"] and created["max_score"] == 20
    for viewer in (lecturer, ta, student):
        assert HW["title"] in by_title(viewer)


def test_due_time_is_stored_as_utc(sign_in):
    created = assign(sign_in("lecturer"))
    assert created["due_at"] == "2099-01-01T02:00:00Z"  # 09:00 in Bangkok (+07:00)


def test_only_lecturer_can_assign(sign_in, anon):
    assert anon.post("/api/homework", json=HW).status_code == 401
    assert sign_in("student").post("/api/homework", json=HW).status_code == 403
    assert sign_in("ta").post("/api/homework", json=HW).status_code == 403
    assert sign_in("lecturer").get("/api/homework").json() == []


@pytest.mark.parametrize("bad", [
    {"title": "   "}, {"course_id": ""}, {"max_score": 0}, {"max_score": 5000}, {"due_at": "not a date"},
])
def test_assigning_validates_input(sign_in, bad):
    assert sign_in("lecturer").post("/api/homework", json={**HW, **bad}).status_code == 422


def test_homework_listed_soonest_due_first(sign_in):
    lecturer = sign_in("lecturer")
    assign(lecturer, title="Later", due_at="2099-06-01T00:00:00Z")
    assign(lecturer, title="Sooner", due_at="2099-02-01T00:00:00Z")
    assert [h["title"] for h in lecturer.get("/api/homework").json()] == ["Sooner", "Later"]


# --- Student: to do -> submitted -> graded -------------------------------------

def test_student_sees_what_is_left_to_do(sign_in):
    lecturer, student, ta = sign_in("lecturer"), sign_in("student"), sign_in("ta")
    hw = assign(lecturer)
    assert by_title(student)[HW["title"]]["status"] == "todo"

    assert student.post(f"/api/homework/{hw['id']}/submissions", json={"answer": "my ERD link"}).status_code == 201
    mine = by_title(student)[HW["title"]]
    assert mine["status"] == "submitted"
    assert mine["my_submission"]["answer"] == "my ERD link"
    assert mine["my_submission"]["score"] is None

    sub_id = mine["my_submission"]["id"]
    assert ta.patch(f"/api/homework/{hw['id']}/submissions/{sub_id}", json={"score": 18, "feedback": "Nice"}).status_code == 200
    done = by_title(student)[HW["title"]]
    assert done["status"] == "graded"
    assert (done["my_submission"]["score"], done["my_submission"]["feedback"]) == (18, "Nice")


def test_overdue_flag_only_on_unsubmitted_past_due_work(sign_in):
    lecturer, student = sign_in("lecturer"), sign_in("student")
    assign(lecturer)
    past = assign(lecturer, title=PAST["title"], due_at=PAST["due_at"])
    listing = by_title(student)
    assert listing[HW["title"]]["is_overdue"] is False
    assert listing[PAST["title"]]["is_overdue"] is True
    student.post(f"/api/homework/{past['id']}/submissions", json={"answer": "late but here"})
    after = by_title(student)[PAST["title"]]
    assert after["status"] == "submitted" and after["is_overdue"] is False   # no longer "left to do"
    assert after["my_submission"]["is_late"] is True


def test_resubmitting_replaces_the_answer_until_graded(sign_in):
    lecturer, student, ta = sign_in("lecturer"), sign_in("student"), sign_in("ta")
    hw = assign(lecturer)
    url = f"/api/homework/{hw['id']}/submissions"
    assert student.post(url, json={"answer": "first"}).status_code == 201
    assert student.post(url, json={"answer": "second"}).status_code == 200
    subs = ta.get(url).json()
    assert [s["answer"] for s in subs] == ["second"]            # still one submission

    ta.patch(f"{url}/{subs[0]['id']}", json={"score": 10})
    locked = student.post(url, json={"answer": "third"})
    assert locked.status_code == 409
    assert ta.get(url).json()[0]["answer"] == "second"


def test_blank_answer_rejected(sign_in):
    hw = assign(sign_in("lecturer"))
    assert sign_in("student").post(f"/api/homework/{hw['id']}/submissions", json={"answer": "   "}).status_code == 422


def test_cannot_submit_to_missing_homework(sign_in):
    assert sign_in("student").post("/api/homework/999/submissions", json={"answer": "x"}).status_code == 404


def test_staff_cannot_submit_homework(sign_in):
    hw = assign(sign_in("lecturer"))
    for who in ("ta", "lecturer"):
        assert sign_in(who).post(f"/api/homework/{hw['id']}/submissions", json={"answer": "x"}).status_code == 403


# --- Privacy between students ------------------------------------------------------

def test_students_cannot_see_each_others_work_or_the_submission_list(sign_in):
    lecturer, alice = sign_in("lecturer"), sign_in("alice", email="alice@ku.th", sub="sub-alice")
    bob = sign_in("bob", email="bob@ku.th", sub="sub-bob")
    hw = assign(lecturer)
    alice.post(f"/api/homework/{hw['id']}/submissions", json={"answer": "alice secret answer"})

    assert by_title(bob)[HW["title"]]["status"] == "todo"
    assert by_title(bob)[HW["title"]]["my_submission"] is None
    assert "alice secret answer" not in bob.get("/api/homework").text
    assert bob.get(f"/api/homework/{hw['id']}/submissions").status_code == 403
    assert alice.get(f"/api/homework/{hw['id']}/submissions").status_code == 403


def test_student_view_has_no_staff_counts_and_staff_view_has_no_answers(sign_in):
    lecturer, student, ta = sign_in("lecturer"), sign_in("student"), sign_in("ta")
    hw = assign(lecturer)
    student.post(f"/api/homework/{hw['id']}/submissions", json={"answer": "mine"})
    assert by_title(student)[HW["title"]]["submission_count"] is None
    staff = by_title(ta)[HW["title"]]
    assert (staff["submission_count"], staff["graded_count"]) == (1, 0)
    assert staff["my_submission"] is None and staff["status"] is None


# --- TA grades ---------------------------------------------------------------------------

def test_ta_sees_submissions_and_counts_update_after_grading(sign_in):
    lecturer, ta = sign_in("lecturer"), sign_in("ta")
    alice = sign_in("alice", email="alice@ku.th", sub="sub-alice")
    bob = sign_in("bob", email="bob@ku.th", sub="sub-bob")
    hw = assign(lecturer)
    url = f"/api/homework/{hw['id']}/submissions"
    alice.post(url, json={"answer": "A"})
    bob.post(url, json={"answer": "B"})

    subs = ta.get(url).json()
    assert [(s["student_name"], s["answer"]) for s in subs] == [("Alice", "A"), ("Bob", "B")]
    assert lecturer.get(url).status_code == 200                      # lecturer may look
    ta.patch(f"{url}/{subs[0]['id']}", json={"score": 15})
    row = by_title(ta)[HW["title"]]
    assert (row["submission_count"], row["graded_count"]) == (2, 1)


def test_only_a_ta_can_grade(sign_in, anon):
    lecturer, student = sign_in("lecturer"), sign_in("student")
    hw = assign(lecturer)
    url = f"/api/homework/{hw['id']}/submissions"
    student.post(url, json={"answer": "A"})
    sub_id = sign_in("ta").get(url).json()[0]["id"]
    body = {"score": 20}
    assert anon.patch(f"{url}/{sub_id}", json=body).status_code == 401
    assert student.patch(f"{url}/{sub_id}", json=body).status_code == 403   # cannot grade own work
    assert lecturer.patch(f"{url}/{sub_id}", json=body).status_code == 403
    assert by_title(student)[HW["title"]]["status"] == "submitted"


@pytest.mark.parametrize("score,status", [(0, 200), (20, 200), (21, 422), (-1, 422), (1000, 422)])
def test_score_must_be_within_zero_and_max(sign_in, score, status):
    lecturer, student, ta = sign_in("lecturer"), sign_in("student"), sign_in("ta")
    hw = assign(lecturer, max_score=20)
    url = f"/api/homework/{hw['id']}/submissions"
    student.post(url, json={"answer": "A"})
    sub_id = ta.get(url).json()[0]["id"]
    assert ta.patch(f"{url}/{sub_id}", json={"score": score}).status_code == status


def test_regrading_updates_the_score_and_blank_feedback_is_cleared(sign_in):
    lecturer, student, ta = sign_in("lecturer"), sign_in("student"), sign_in("ta")
    hw = assign(lecturer)
    url = f"/api/homework/{hw['id']}/submissions"
    student.post(url, json={"answer": "A"})
    sub_id = ta.get(url).json()[0]["id"]
    ta.patch(f"{url}/{sub_id}", json={"score": 10, "feedback": "Add keys"})
    ta.patch(f"{url}/{sub_id}", json={"score": 17, "feedback": "  "})
    graded = by_title(student)[HW["title"]]["my_submission"]
    assert (graded["score"], graded["feedback"]) == (17, None)


def test_submission_id_must_belong_to_that_homework(sign_in):
    lecturer, student, ta = sign_in("lecturer"), sign_in("student"), sign_in("ta")
    one, two = assign(lecturer), assign(lecturer, title="HW2")
    student.post(f"/api/homework/{one['id']}/submissions", json={"answer": "A"})
    sub_id = ta.get(f"/api/homework/{one['id']}/submissions").json()[0]["id"]
    assert ta.patch(f"/api/homework/{two['id']}/submissions/{sub_id}", json={"score": 5}).status_code == 404
    assert ta.get("/api/homework/999/submissions").status_code == 404
