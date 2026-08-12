# SUPUESTO: catalogo de variables del reactor a modo de ejemplo/placeholder,
# basado en el mock del prototipo de frontend (Claude Design). La lista real
# de ~30 variables, IDs, unidades y rangos debe confirmarse con el SIR/SSO
# antes de avanzar con el modelo de datos definitivo.
REACTOR_VARIABLES = [
    {"id": "POT_NUC", "name": "Potencia neutronica", "unit": "W", "group": "Nucleo"},
    {"id": "REA_NEU", "name": "Reactividad", "unit": "pcm", "group": "Cinetica"},
    {"id": "POS_BR1", "name": "Insercion barra control 1", "unit": "%", "group": "Control"},
    # ... completar hasta ~30 variables cuando se confirme el listado real.
]
