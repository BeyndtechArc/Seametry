// Every stock photograph the site shows (foundations section 9: photo
// frames, landing only). Each was checked on its own Unsplash page as "Free
// to use under the Unsplash License" on 24 October 2026, downloaded at 1200
// wide and written to public/photos at 960 wide as WebP. Served as plain
// files, not through Next's image optimiser, whose transformations count
// against the hosting plan's limits.

export type Photo = {
  src: string;
  width: number;
  height: number;
  /** What the photograph shows, for assistive technology. */
  alt: string;
  photographer: string;
  source: string;
};

export const photos = {
  glassTowers: {
    src: "/photos/glass-towers.webp",
    width: 960,
    height: 640,
    alt: "A glass office facade seen from below against a grey sky",
    photographer: "Clay LeConey",
    source: "https://unsplash.com/photos/oW66SyCnoLs",
  },
  siliconWafer: {
    src: "/photos/silicon-wafer.webp",
    width: 960,
    height: 720,
    alt: "Close view of chip dies on a silicon wafer",
    photographer: "Maxence Pira",
    source: "https://unsplash.com/photos/aNaq4lbX99E",
  },
  serverCabinets: {
    src: "/photos/server-cabinets.webp",
    width: 960,
    height: 1200,
    alt: "Rows of white server cabinets in a data centre",
    photographer: "Tony Marinescu",
    source: "https://unsplash.com/photos/fImCPTZ026U",
  },
  robotArm: {
    src: "/photos/robot-arm.webp",
    width: 960,
    height: 602,
    alt: "A blue industrial robot arm on a factory line",
    photographer: "Homa Appliances",
    source: "https://unsplash.com/photos/sz1CHL7Pky0",
  },
  warehouseAisle: {
    src: "/photos/warehouse-aisle.webp",
    width: 960,
    height: 640,
    alt: "A long warehouse aisle between shelves of boxes",
    photographer: "Lance Chang",
    source: "https://unsplash.com/photos/h3pVxOIpnzk",
  },
} as const satisfies Record<string, Photo>;
