"""
Authentication Exception Classes
Custom exceptions for better error handling
"""


class AuthenticationError(Exception):
    """Base exception for authentication errors"""
    def __init__(self, message: str, error_code: int = 1000):
        self.message = message
        self.error_code = error_code
        super().__init__(self.message)


class InvalidCredentialsError(AuthenticationError):
    """Raised when email or password is incorrect"""
    def __init__(self, message: str = "Invalid email or password"):
        super().__init__(message, error_code=1001)


class AccountDisabledError(AuthenticationError):
    """Raised when user account is disabled"""
    def __init__(self, message: str = "Account is disabled"):
        super().__init__(message, error_code=1002)


class OrganizationDisabledError(AuthenticationError):
    """Raised when organization is disabled"""
    def __init__(self, message: str = "Organization account is disabled"):
        super().__init__(message, error_code=1003)


class OrganizationDisabledError(AuthenticationError):
    """Raised when organization is disabled"""
    def __init__(self, message: str = "Organization account is disabled"):
        super().__init__(message, error_code=1003)


class PasswordNotSetError(AuthenticationError):
    """Raised when user has no password configured"""
    def __init__(self, message: str = "Password not configured"):
        super().__init__(message, error_code=1004)


class InvalidTokenError(AuthenticationError):
    """Raised when token is invalid or expired"""
    def __init__(self, message: str = "Invalid or expired token"):
        super().__init__(message, error_code=1005)


class TokenExpiredError(AuthenticationError):
    """Raised when token has expired"""
    def __init__(self, message: str = "Token has expired"):
        super().__init__(message, error_code=1006)


class RateLimitExceededError(AuthenticationError):
    """Raised when rate limit is exceeded"""
    def __init__(self, retry_after: int = 60):
        super().__init__(
            f"Too many login attempts. Try again in {retry_after} seconds",
            error_code=1007
        )
        self.retry_after = retry_after
