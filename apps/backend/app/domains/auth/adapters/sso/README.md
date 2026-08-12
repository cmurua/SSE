# SSO real de la UNC (reservado - futuro)

Este paquete queda RESERVADO para la integracion futura con el sistema de
autenticacion institucional real de la UNC (mencionado como dependencia en
la SRS, seccion 2.4). Hoy la validacion de credenciales la resuelve
`adapters/external_api_provider.py` (modulo externo distinto, ya confirmado).

Cuando se defina el protocolo real (OAuth2/OIDC, SAML, u otro), implementar
aca una clase que cumpla `CredentialsProvider` (adapters/base.py) y
cambiar unicamente `auth/dependencies.py::get_credentials_provider` para
apuntar a esta implementacion. Ningun otro modulo del backend deberia
necesitar cambios.

Supuesto: se asume que el mecanismo de intercambio sera resuelto por este
adapter y seguira exponiendo el mismo contrato (username/password o, si el
protocolo real es redirect-based, un metodo adicional a definir).
