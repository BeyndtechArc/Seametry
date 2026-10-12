// Generated from seametry.tokens.json. Do not edit.
export const theme = {
  "dark": {
    "surface": {
      "ground": "#14180A",
      "sheet": "#1B2010",
      "raised": "#232915",
      "tray": "#2D3420",
      "inverse": "#ECEEDF"
    },
    "text": {
      "primary": "#ECEEDF",
      "secondary": "#B4B9A2",
      "tertiary": "#9CA289",
      "faint": "#5E644A",
      "onTouch": "#141803",
      "inverse": "#14180A"
    },
    "line": {
      "rule": "#343B26",
      "strong": "#4E573A",
      "highlight": "rgba(236,246,232,0.06)"
    },
    "accent": {
      "touch": "#98AD39",
      "touchPressed": "#8DA32C",
      "provenance": "#AAA8D0",
      "provenanceField": "#3A20D6",
      "touchText": "#AFC45F"
    },
    "status": {
      "success": "#8FCBA4",
      "warning": "#E3C178",
      "error": "#DEA098"
    },
    "feature": {
      "ground": "#171C03",
      "sheet": "#1F2507",
      "raised": "#2A310F",
      "text": {
        "primary": "#ECEEDF",
        "secondary": "#B4B9A2"
      }
    }
  },
  "light": {
    "surface": {
      "ground": "#E7E9DF",
      "sheet": "#F2F3EA",
      "raised": "#FAFBF5",
      "tray": "#D4DACB",
      "inverse": "#20251E"
    },
    "text": {
      "primary": "#242B22",
      "secondary": "#3D493C",
      "tertiary": "#51604F",
      "faint": "#9AA596",
      "onTouch": "#141803",
      "inverse": "#F5F5F3"
    },
    "line": {
      "rule": "#CBD1C3",
      "strong": "#A9B3A3",
      "highlight": "rgba(255,255,255,0.55)"
    },
    "accent": {
      "touch": "#98AD39",
      "touchPressed": "#8DA32C",
      "provenance": "#554C9C",
      "provenanceField": "#3520C0",
      "touchText": "#43540B"
    },
    "status": {
      "success": "#2E6947",
      "warning": "#7B5915",
      "error": "#A3433A"
    },
    "feature": {
      "ground": "#B8C56A",
      "sheet": "#C5D17C",
      "raised": "#D3DC94",
      "text": {
        "primary": "#20231B",
        "secondary": "#3E432D"
      }
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
  },
  "scale": {
    "touch": {
      "50": "#262E02",
      "100": "#394407",
      "200": "#4D5A10",
      "300": "#617219",
      "400": "#778A22",
      "500": "#8DA32C",
      "600": "#A6BB58",
      "700": "#BFD37E",
      "800": "#D9EBA2",
      "900": "#EEFEC0"
    },
    "provenance": {
      "50": "#292753",
      "100": "#3C3972",
      "200": "#4F4C93",
      "300": "#6460B6",
      "400": "#7975DA",
      "500": "#8F8AFF",
      "600": "#A9AAFE",
      "700": "#C5C7FE",
      "800": "#E2E4FF",
      "900": "#F3F4FF"
    },
    "olive": {
      "50": "#1A201A",
      "100": "#2D332C",
      "200": "#414740",
      "300": "#575C56",
      "400": "#6D736C",
      "500": "#848A83",
      "600": "#9CA19B",
      "700": "#B5B9B4",
      "800": "#CED2CD",
      "900": "#E8ECE7"
    }
  }
} as const;
export type ThemeName = keyof typeof theme;
