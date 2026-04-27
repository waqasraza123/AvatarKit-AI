from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parents[1]))

from app.main import create_app


def test_create_app_title() -> None:
    application = create_app()

    assert application.title == "AvatarKit AI Runtime"
