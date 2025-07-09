# Database Connection Unit Tests

This directory contains comprehensive unit tests for the database connection functionality in `backend.py`.

## Overview

The test suite validates:
- Database configuration setup
- Connection establishment and error handling
- Database operations in API endpoints
- Proper resource cleanup (connections and cursors)
- Error handling and response formatting

## Files

- `test_database_connection.py` - Main test suite
- `requirements-test.txt` - Testing dependencies
- `run_tests.py` - Test runner script
- `TEST_README.md` - This documentation

## Quick Start

### Option 1: Using the Test Runner (Recommended)
```bash
python3 run_tests.py
```

The test runner will:
- Check and install required dependencies
- Run all database connection tests
- Provide detailed output and results

### Option 2: Direct pytest execution
```bash
# Install dependencies first
pip install -r requirements-test.txt

# Run tests
pytest test_database_connection.py -v
```

## Test Coverage

### Database Configuration Tests
- `test_db_config_exists()` - Validates DB_CONFIG dictionary structure
- Checks all required database connection parameters

### Connection Function Tests
- `test_get_db_connection_success()` - Tests successful database connection
- `test_get_db_connection_failure()` - Tests connection error handling
- `test_get_db_connection_with_cursor_factory()` - Validates RealDictCursor usage

### API Endpoint Tests
- `test_upload_endpoint_database_interaction()` - Tests /upload endpoint database operations
- `test_upload_endpoint_database_error()` - Tests /upload endpoint error handling
- `test_comments_endpoint_database_interaction()` - Tests /comments endpoint database operations
- `test_comments_endpoint_database_error()` - Tests /comments endpoint error handling
- `test_comments_endpoint_no_metadata()` - Tests /comments endpoint without metadata

### Resource Management Tests
- `test_database_connection_context_management()` - Validates proper cleanup of connections and cursors

## Test Strategy

### Mocking Approach
The tests use extensive mocking to:
- Isolate database logic from actual database connections
- Simulate various database states (success, failure, different data)
- Test error handling without requiring a live database
- Ensure tests run quickly and reliably

### Key Mock Targets
- `psycopg2.connect()` - Database connection establishment
- `get_db_connection()` - High-level connection function
- Database cursors and their methods
- Environment variables (API keys)

## Sample Test Output

```
============================= test session starts ==============================
platform linux -- Python 3.13.5, pytest-8.4.1, pluggy-1.6.0 -- /usr/bin/python3
...
test_database_connection.py::TestDatabaseConnection::test_db_config_exists PASSED [ 10%]
test_database_connection.py::TestDatabaseConnection::test_get_db_connection_success PASSED [ 20%]
test_database_connection.py::TestDatabaseConnection::test_get_db_connection_failure PASSED [ 30%]
...
============================== 10 passed in 1.28s ==============================
```

## Dependencies

### Required for Testing
- `pytest>=7.0.0` - Testing framework
- `pytest-asyncio>=0.21.0` - Async test support
- `psycopg2-binary>=2.9.0` - PostgreSQL adapter
- `fastapi[all]>=0.68.0` - FastAPI framework
- `httpx>=0.24.0` - HTTP client for testing

### Backend Dependencies
- `python-dotenv>=0.19.0` - Environment variable loading
- `google-generativeai>=0.3.0` - Gemini API client

## Database Configuration

The tests validate this database configuration from `backend.py`:
```python
DB_CONFIG = {
    "database": "futurehack",
    "host": "100.97.20.73", 
    "user": "zhenyu",
    "password": "123123",
    "port": "5432"
}
```

## Environment Setup

The tests automatically handle the GEMINI_API_KEY requirement by mocking the environment variable during import.

## Error Handling

The test suite covers various error scenarios:
- Database connection failures
- SQL execution errors
- Network timeouts
- Invalid database configurations
- Missing environment variables

## Integration Notes

These tests focus on the database connection layer and can be extended to:
- Test actual database operations (integration tests)
- Validate specific SQL queries
- Test database schema compatibility
- Performance testing with database load

## Troubleshooting

### Common Issues

1. **Import errors**: Ensure `backend.py` is in the same directory
2. **Missing dependencies**: Run `pip install -r requirements-test.txt`
3. **API key errors**: Tests mock the API key automatically
4. **Path issues**: Tests use relative imports, run from the backend directory

### Debug Mode
For detailed test output:
```bash
pytest test_database_connection.py -v -s --tb=long
```

## Contributing

When adding new database functionality to `backend.py`:
1. Add corresponding test cases to `test_database_connection.py`
2. Follow the existing mocking patterns
3. Test both success and failure scenarios
4. Ensure proper resource cleanup
5. Update this documentation
