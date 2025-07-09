#!/usr/bin/env python3
"""
Test runner for database connection tests
"""
import subprocess
import sys
import os

def install_test_dependencies():
    """Install test dependencies if needed"""
    try:
        import pytest
        import psycopg2
        from fastapi.testclient import TestClient
        print("✓ All test dependencies are already installed")
        return True
    except ImportError as e:
        print(f"Missing dependency: {e}")
        print("Installing test dependencies...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements-test.txt"])
            print("✓ Test dependencies installed successfully")
            return True
        except subprocess.CalledProcessError:
            print("✗ Failed to install test dependencies")
            return False

def run_database_tests():
    """Run the database connection tests"""
    print("Running database connection tests...")
    try:
        # Run pytest with verbose output
        result = subprocess.run([
            sys.executable, "-m", "pytest", 
            "test_database_connection.py", 
            "-v",
            "--tb=short"
        ], capture_output=True, text=True)
        
        print("STDOUT:")
        print(result.stdout)
        
        if result.stderr:
            print("STDERR:")
            print(result.stderr)
        
        if result.returncode == 0:
            print("✓ All database connection tests passed!")
        else:
            print("✗ Some tests failed")
        
        return result.returncode == 0
    except Exception as e:
        print(f"✗ Error running tests: {e}")
        return False

def main():
    """Main test runner function"""
    print("Database Connection Test Runner")
    print("=" * 40)
    
    # Check if we're in the right directory
    if not os.path.exists("backend.py"):
        print("✗ Error: backend.py not found. Please run this script from the backend directory.")
        sys.exit(1)
    
    # Install dependencies if needed
    if not install_test_dependencies():
        sys.exit(1)
    
    # Run tests
    success = run_database_tests()
    
    if success:
        print("\n✓ All tests completed successfully!")
        sys.exit(0)
    else:
        print("\n✗ Tests failed. Please check the output above.")
        sys.exit(1)

if __name__ == "__main__":
    main()
