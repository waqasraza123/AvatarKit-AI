from pathlib import Path
import sys

from pytest import CaptureFixture

sys.path.insert(0, str(Path(__file__).parents[1]))

from ingestion_worker.worker import main


def test_ingestion_worker_entrypoint(capsys: CaptureFixture[str]) -> None:
    main()

    assert "ingestion worker foundation" in capsys.readouterr().out
