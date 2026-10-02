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


# --- Tokens -----------------------------------------------------------------
# Jerarquia propia para no filtrar las excepciones de PyJWT al resto del
# backend: quien valida un token no deberia tener que importar `jwt` ni saber
# que libreria se usa. Ademas permite que un handler HTTP capture TokenError y
# responda 401 sin enumerar cada caso.


class TokenError(DomainError):
    """Cualquier problema al validar un token propio."""


class ExpiredTokenError(TokenError):
    """El token era valido pero su `exp` ya paso.

    Se distingue del resto a proposito: es el unico caso en el que al cliente
    le sirve reintentar, renovando con el refresh token (ver el ciclo de
    renovacion de services/api/httpClient.ts en el frontend).
    """


class InvalidTokenError(TokenError):
    """Firma incorrecta, token malformado o sin los claims minimos."""


class WrongTokenTypeError(TokenError):
    """El token es valido, pero no es del tipo que el llamador esperaba.

    Que un refresh token no sirva para autenticar una request REST es una
    garantia de seguridad, no un detalle: el refresh vive dias y suele viajar
    y guardarse distinto que el access, que dura minutos.
    """
