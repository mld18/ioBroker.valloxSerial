/*global systemDictionary:true */
"use strict";

systemDictionary = {
	"Main settings": {
		"en": "Main settings",
		"de": "Haupteinstellungen"
	},
	"Serial port device": {
		"en": "Serial port device",
		"de": "Device für serielle Schnittstelle"
	},
	"Absolute path to serial port device address": {
		"en": "Absolute path to serial port device address, e.g. /dev/ttyUSB0",
		"de": "Absoluter Pfad zum Device für den seriellen Port, z.B. /dev/ttyUSB0"
	},
	"Send commands with this address (two control units/panels with same address cause bus failure)": {
		"en": "Send commands with this address (two control units/panels with same address cause bus failure)",
		"de": "Befehle werden mit dieser Reglereinheitsadresse gesendet (mehrere Reglereinheiten mit derselben Adresse führen zu Bus-Problemen)"
	},
	"Log settings": {
		"en": "Log settings",
		"de": "Logging-Einstellungen"
	},
	"Log serial port events": {
		"en": "Log Serial port events",
		"de": "Serial-Port-Ereignisse protokollieren"
	},
	"If set, uncritical serial port events are logged (info level).": {
		"en": "If set, uncritical serial port events are logged (info level).",
		"de": "Falls aktiviert, werden auch unkritische Events auf der seriellen Schnittstelle protokolliert (Loglevel: Info)."
	},
	"Datagrams are logged with the given loglevel": {
		"en": "Datagrams are logged with the given loglevel",
		"de": "Datagramme werden mit dem angegebenen Loglevel protokolliert"
	},
	"Log all readings": {
		"en": "Log all readings",
		"de": "Alle Ablesungen protokollieren"
	},
	"If set, all value readings that might lead to a state change are logged (info level).": {
		"en": "If set, all value readings that might lead to a state change are logged (info level).",
		"de": "Falls aktiviert, werden alle Ablesungen im Loglevel Info protokolliert, die zu einer Statusänderung führen könnten."
	},
	"Log event handler calls": {
		"en": "Log event handler calls",
		"de": "Event-Handler-Aufrufe protokollieren"
	},
	"If set, all calls of top-level event handlers are logged (info level).": {
		"en": "If set, all calls of top-level event handlers are logged (info level).",
		"de": "Falls aktiviert, werden alle Aufrufe von Top-Level-Event-Handler-Funktionen auf Loglevel Info protokolliert."
	}
};