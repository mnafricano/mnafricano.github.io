import plistlib

from erome_archiver.installer import LABEL, render_launch_agent


def test_launch_agent_payload_runs_local_module_and_restarts_after_failure():
    payload = plistlib.loads(render_launch_agent("/test/python"))

    assert payload["Label"] == LABEL
    assert payload["ProgramArguments"] == ["/test/python", "-m", "erome_archiver", "serve"]
    assert payload["RunAtLoad"] is True
    assert payload["KeepAlive"] == {"SuccessfulExit": False}
