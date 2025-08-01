"""Application version information"""

VERSION = "2.0.0"
API_VERSION = "v2"
BUILD_NUMBER = None  # Set during CI/CD
COMMIT_HASH = None   # Set during CI/CD

def get_version_info():
    """Get complete version information"""
    return {
        "version": VERSION,
        "api_version": API_VERSION,
        "build": BUILD_NUMBER,
        "commit": COMMIT_HASH
    }
