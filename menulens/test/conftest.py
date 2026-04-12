"""
pytest configuration for the MenuLens test directory.

After each session, writes a human-readable results summary to an
incrementing file (test_results_1.txt, test_results_2.txt, ...) so
previous runs are never overwritten.
"""

import os
import pytest


def _next_output_path(directory: str) -> str:
    i = 1
    while True:
        path = os.path.join(directory, f"test_results_{i}.txt")
        if not os.path.exists(path):
            return path
        i += 1


class ResultCollector:
    def __init__(self):
        self.results: list[tuple[str, str, str]] = []  # (nodeid, outcome, longrepr)

    def record(self, report):
        if report.when != "call":
            return
        longrepr = ""
        if report.failed:
            longrepr = str(report.longrepr)
        self.results.append((report.nodeid, report.outcome.upper(), longrepr))


@pytest.fixture(scope="session")
def result_collector(request):
    collector = ResultCollector()
    request.config._result_collector = collector
    return collector


def pytest_runtest_logreport(report):
    collector = getattr(report, "_result_collector", None)
    # Access via config stash instead
    pass


def pytest_configure(config):
    config._result_collector = ResultCollector()


def pytest_runtest_makereport(item, call):
    pass


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_protocol(item, nextitem):
    yield


@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()
    collector = getattr(item.config, "_result_collector", None)
    if collector is not None:
        collector.record(report)


def pytest_sessionfinish(session, exitstatus):
    collector = getattr(session.config, "_result_collector", None)
    if not collector or not collector.results:
        return

    passed  = [r for r in collector.results if r[1] == "PASSED"]
    failed  = [r for r in collector.results if r[1] == "FAILED"]
    skipped = [r for r in collector.results if r[1] == "SKIPPED"]

    out_path = _next_output_path(os.path.dirname(__file__))

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(f"Test run summary\n")
        f.write(f"{'=' * 60}\n")
        f.write(f"Total: {len(collector.results)}  "
                f"Passed: {len(passed)}  "
                f"Failed: {len(failed)}  "
                f"Skipped: {len(skipped)}\n")
        f.write(f"{'=' * 60}\n\n")

        if passed:
            f.write("PASSED\n")
            for nodeid, _, _ in passed:
                f.write(f"  {nodeid}\n")
            f.write("\n")

        if failed:
            f.write("FAILED\n")
            for nodeid, _, longrepr in failed:
                f.write(f"  {nodeid}\n")
                if longrepr:
                    for line in longrepr.splitlines():
                        f.write(f"    {line}\n")
            f.write("\n")

        if skipped:
            f.write("SKIPPED\n")
            for nodeid, _, _ in skipped:
                f.write(f"  {nodeid}\n")

    print(f"\nTest results written to: {out_path}")
