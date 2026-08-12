// Setup de i18next. Namespaces alineados con los grupos de labels.jsx del
// prototipo (nav, login, home, realtime, historicals, reports, help).
// SUPUESTO: solo se completan las claves en espanol por ahora (RF09 pide
// es/en, "no hace falta implementarla completa ahora" segun el pedido).
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import es_common from "./locales/es/common.json";
import en_common from "./locales/en/common.json";

i18n.use(initReactI18next).init({
  resources: {
    es: { common: es_common },
    en: { common: en_common },
  },
  lng: "es",
  fallbackLng: "es",
  interpolation: { escapeValue: false },
});

export default i18n;
