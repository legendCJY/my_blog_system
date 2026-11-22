def pytest_addoption(parser) -> None:
    parser.addoption(
        "--with-postgres", action="store_true",
        help="Run PostgreSQL integration tests using TEST_DATABASE_URL or the local .env database.",
    )
