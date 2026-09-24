// Generated from seametry.tokens.json. Do not edit.
export const theme = {
  "dark": {
    "surface": {
      "ground": "#0A0A0A",
      "sheet": "#141414",
      "raised": "#1C1C1C",
      "tray": "#262626",
      "inverse": "#F5F5F3"
    },
    "text": {
      "primary": "#F5F5F3",
      "secondary": "#B4B4AF",
      "tertiary": "#8A8A83",
      "faint": "#5A5A54",
      "onTouch": "#16200B",
      "inverse": "#0A0A0A"
    },
    "line": {
      "rule": "#242422",
      "strong": "#3A3A36",
      "highlight": "rgba(255,255,255,0.06)"
    },
    "accent": {
      "touch": "#B7EC75",
      "touchPressed": "#A3D862",
      "provenance": "#8F8AFF",
      "provenanceField": "#3A20D6"
    }
  },
  "light": {
    "surface": {
      "ground": "#EDEBE3",
      "sheet": "#F7F5EF",
      "raised": "#FCFBF7",
      "tray": "#E0DDD1",
      "inverse": "#1F1E1D"
    },
    "text": {
      "primary": "#1F1E1D",
      "secondary": "#45423C",
      "tertiary": "#65615A",
      "faint": "#A8A49A",
      "onTouch": "#16200B",
      "inverse": "#F5F5F3"
    },
    "line": {
      "rule": "#DBD8CD",
      "strong": "#C4C0B4",
      "highlight": "rgba(255,255,255,0.70)"
    },
    "accent": {
      "touch": "#B7EC75",
      "touchPressed": "#A3D862",
      "provenance": "#3A20D6",
      "provenanceField": "#3A20D6"
    }
  }
} as const;
export const tokens = {
  "font": {
    "family": {
      "display": [
        "Sentient",
        "Fraunces",
        "Georgia",
        "serif"
      ],
      "ui": [
        "Switzer",
        "Schibsted Grotesk",
        "system-ui",
        "sans-serif"
      ],
      "digest": [
        "Fragment Mono",
        "ui-monospace",
        "monospace"
      ]
    },
    "weight": {
      "light": 300,
      "regular": 400,
      "medium": 500,
      "semibold": 600,
      "bold": 700
    },
    "size": {
      "micro": 12,
      "small": 13,
      "body": 15,
      "lead": 17,
      "title-s": 20,
      "title": 24,
      "title-l": 30,
      "figure": 38,
      "figure-l": 48,
      "display": 60,
      "display-l": 76
    },
    "tracking": {
      "display": "-0.03em",
      "title": "-0.015em",
      "body": "0em",
      "serial": "0.14em"
    }
  },
  "space": {
    "0": 0,
    "1": 2,
    "2": 4,
    "3": 8,
    "4": 12,
    "5": 16,
    "6": 20,
    "7": 24,
    "8": 32,
    "9": 40,
    "10": 56,
    "11": 72,
    "12": 96,
    "13": 128
  },
  "radius": {
    "data": 0,
    "surface": 4,
    "punch": 12,
    "control": 999,
    "sheet": 28
  },
  "size": {
    "tray": 8,
    "target": 44,
    "key": 50,
    "readable": "72ch",
    "content": 1200
  },
  "motion": {
    "duration": {
      "quick": 120,
      "base": 180,
      "settle": 220,
      "sheet": 240,
      "punch": 90,
      "punchStagger": 70,
      "seal": 180
    },
    "easing": {
      "standard": [
        0.2,
        0,
        0,
        1
      ],
      "exit": [
        0.4,
        0,
        1,
        1
      ]
    }
  },
  "breakpoint": {
    "s": 480,
    "m": 768,
    "l": 1024,
    "xl": 1280
  }
} as const;
export type ThemeName = keyof typeof theme;
