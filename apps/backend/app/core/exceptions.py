# Excepciones de dominio y sus handlers HTTP. Los dominios lanzan estas
# excepciones; este modulo centraliza como se traducen a respuestas HTTP.
class DomainError(Exception):
    pass


class InvalidCredentialsError(DomainError):
    pass


class AccountLockedError(DomainError):
    pass


class ReactorNotOperatingError(DomainError):
    pass
