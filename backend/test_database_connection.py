import pytest
import psycopg2
from unittest.mock import patch, MagicMock, Mock
from psycopg2.extras import RealDictCursor
import sys
import os

# Add the current directory to Python path to import backend
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Mock the os.getenv function to return a test API key when importing backend
with patch('os.getenv') as mock_getenv:
    mock_getenv.return_value = 'test_api_key_for_testing'
    from backend import get_db_connection, DB_CONFIG, app
    
from fastapi.testclient import TestClient

# Create test client
client = TestClient(app)

class TestDatabaseConnection:
    """Test suite for database connection functionality"""
    
    def test_db_config_exists(self):
        """Test that database configuration is properly defined"""
        assert DB_CONFIG is not None
        assert "database" in DB_CONFIG
        assert "host" in DB_CONFIG
        assert "user" in DB_CONFIG
        assert "password" in DB_CONFIG
        assert "port" in DB_CONFIG
        
        # Check that all values are strings
        for key, value in DB_CONFIG.items():
            assert isinstance(value, str), f"DB_CONFIG['{key}'] should be a string"
    
    @patch('backend.psycopg2.connect')
    def test_get_db_connection_success(self, mock_connect):
        """Test successful database connection"""
        # Mock the connection object
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn
        
        # Call the function
        result = get_db_connection()
        
        # Verify the connection was called with correct parameters
        mock_connect.assert_called_once_with(
            database=DB_CONFIG["database"],
            host=DB_CONFIG["host"],
            user=DB_CONFIG["user"],
            password=DB_CONFIG["password"],
            port=DB_CONFIG["port"],
            cursor_factory=RealDictCursor
        )
        
        # Verify the returned connection is the mock
        assert result == mock_conn
    
    @patch('backend.psycopg2.connect')
    def test_get_db_connection_failure(self, mock_connect):
        """Test database connection failure handling"""
        # Mock a connection error
        mock_connect.side_effect = psycopg2.OperationalError("Connection failed")
        
        # Test that the function raises the exception
        with pytest.raises(psycopg2.OperationalError):
            get_db_connection()
        
        # Verify the connection was attempted
        mock_connect.assert_called_once()
    
    @patch('backend.psycopg2.connect')
    def test_get_db_connection_with_cursor_factory(self, mock_connect):
        """Test that RealDictCursor is used as cursor factory"""
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn
        
        get_db_connection()
        
        # Verify RealDictCursor was passed as cursor_factory
        call_args = mock_connect.call_args
        assert call_args[1]['cursor_factory'] == RealDictCursor
    
    @patch('backend.get_db_connection')
    def test_upload_endpoint_database_interaction(self, mock_get_db_connection):
        """Test the /upload endpoint database interaction"""
        # Mock database connection and cursor
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_get_db_connection.return_value = mock_conn
        mock_conn.cursor.return_value = mock_cursor
        
        # Mock query results
        mock_cursor.fetchall.return_value = [
            {"id": 1, "name": "Author 1"},
            {"id": 2, "name": "Author 2"}
        ]
        
        # Make request to upload endpoint
        response = client.get("/upload")
        
        # Verify response
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Data retrieved successfully"
        assert len(data["authors"]) == 2
        
        # Verify database interaction
        mock_get_db_connection.assert_called_once()
        mock_conn.cursor.assert_called_once()
        mock_cursor.execute.assert_called_once_with("SELECT * FROM authors;")
        mock_cursor.fetchall.assert_called_once()
        mock_cursor.close.assert_called_once()
        mock_conn.close.assert_called_once()
    
    @patch('backend.get_db_connection')
    def test_upload_endpoint_database_error(self, mock_get_db_connection):
        """Test /upload endpoint when database connection fails"""
        # Mock database connection failure
        mock_get_db_connection.side_effect = psycopg2.OperationalError("Database connection failed")
        
        # Make request to upload endpoint
        response = client.get("/upload")
        
        # Verify error response
        assert response.status_code == 500
        data = response.json()
        assert "Database error" in data["message"]
        assert "Database connection failed" in data["message"]
    
    @patch('backend.get_db_connection')
    def test_comments_endpoint_database_interaction(self, mock_get_db_connection):
        """Test the /comments endpoint database interaction"""
        # Mock database connection and cursor
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_get_db_connection.return_value = mock_conn
        mock_conn.cursor.return_value = mock_cursor
        
        # Test data
        test_data = {
            "comments": ["Great product!", "Poor quality"],
            "metadata": [
                {
                    "comment": "Great product!",
                    "username": "user1",
                    "rating": 5,
                    "source": "shopee",
                    "product": "Test Product",
                    "timestamp": "2024-01-01T00:00:00Z"
                },
                {
                    "comment": "Poor quality",
                    "username": "user2",
                    "rating": 1,
                    "source": "shopee",
                    "product": "Test Product",
                    "timestamp": "2024-01-01T00:00:00Z"
                }
            ]
        }
        
        # Make request to comments endpoint
        response = client.post("/comments", json=test_data)
        
        # Verify response
        assert response.status_code == 200
        data = response.json()
        assert "Successfully stored" in data["message"]
        assert data["total_stored"] == 2
        
        # Verify database interaction
        mock_get_db_connection.assert_called_once()
        mock_conn.cursor.assert_called_once()
        mock_cursor.executemany.assert_called_once()
        mock_conn.commit.assert_called_once()
        mock_cursor.close.assert_called_once()
        mock_conn.close.assert_called_once()
    
    @patch('backend.get_db_connection')
    def test_comments_endpoint_database_error(self, mock_get_db_connection):
        """Test /comments endpoint when database operation fails"""
        # Mock database connection failure
        mock_get_db_connection.side_effect = psycopg2.OperationalError("Database insert failed")
        
        # Test data
        test_data = {
            "comments": ["Great product!"],
            "metadata": [
                {
                    "comment": "Great product!",
                    "username": "user1",
                    "rating": 5,
                    "source": "shopee",
                    "product": "Test Product",
                    "timestamp": "2024-01-01T00:00:00Z"
                }
            ]
        }
        
        # Make request to comments endpoint
        response = client.post("/comments", json=test_data)
        
        # Verify error response
        assert response.status_code == 500
        data = response.json()
        assert "Database error" in data["message"]
        assert "Database insert failed" in data["message"]
    
    def test_comments_endpoint_no_metadata(self):
        """Test /comments endpoint when no metadata is provided"""
        # Test data without metadata
        test_data = {
            "comments": ["Great product!"]
        }
        
        # Make request to comments endpoint
        response = client.post("/comments", json=test_data)
        
        # Verify response
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "No metadata provided for storage"
        assert data["total_stored"] == 0
    
    @patch('backend.get_db_connection')
    def test_database_connection_context_management(self, mock_get_db_connection):
        """Test proper connection and cursor cleanup"""
        # Mock database connection and cursor
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_get_db_connection.return_value = mock_conn
        mock_conn.cursor.return_value = mock_cursor
        
        # Mock query results
        mock_cursor.fetchall.return_value = []
        
        # Make request to upload endpoint
        response = client.get("/upload")
        
        # Verify that connection and cursor are properly closed
        assert response.status_code == 200
        mock_cursor.close.assert_called_once()
        mock_conn.close.assert_called_once()

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
