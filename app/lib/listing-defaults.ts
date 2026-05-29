/**
 * Default static description used by Etsy listings — taken from the user's
 * old project. Editable from the Ayarlar page (ETSY_DESCRIPTION env).
 */
export const DEFAULT_ETSY_DESCRIPTION = `📏 AVAILABLE SIZES
Digital Download (No Physical Print)
High-resolution 300 DPI JPG file.
Delivered via Etsy message within 24–48 hours after purchase.
No physical item will be shipped.

Small & Gift Sizes

13x18 cm / 5x7"
15x20 cm / 6x8"
20x25 cm / 8x10"
21x29.7 cm / 8x12"
27x35 cm / 11x14"
28x43 cm / 11x17"
A3 (29.7 x 42 cm)

Medium & Popular Sizes

30x40 cm / 12x16"
30x45 cm / 12x18"
40x50 cm / 16x20"
40x60 cm / 16x24"
A2 (42 x 59.4 cm)
45x60 cm / 18x24"
50x70 cm / 20x28"

Large Statement Sizes

A1 (59.4 x 84.1 cm)
60x80 cm / 24x32"
60x90 cm / 24x36"
70x100 cm / 28x40"
75x100 cm / 30x40"
A0 (84.1 x 118.9 cm)

🖼️ FRAME OPTION

This listing includes UNFRAMED prints only.

Want it framed?

Copy this product page link
Go to our Framed Poster Listing
Paste the link into the personalization box
Choose your frame and checkout

📦 PRODUCTION & SHIPPING

• Made to order with premium quality printing
• Carefully packed in protective tubes or flat packaging
• Tracking number provided for every order
• Production time: 2–4 business days
• Delivery time varies by location (usually 5–10 days)

📝 IMPORTANT NOTES

• Colors may vary slightly due to screen differences
• Frame is not included unless purchased separately
• For digital orders, no refunds after delivery`;

export const DEFAULT_ETSY_MATERIALS =
  "Premium Matte Paper,Semi Glossy Paper,Fine Art Paper,Museum Quality Paper,Archival Ink,Giclee Print,High Quality Paper";

export const DEFAULT_ETSY_DEFAULT_QUANTITY = "999";

/**
 * Etsy variation properties have standardized IDs:
 *   513 = Size
 *   514 = Paper Quality / Primary color / etc.
 * The user can override these from Ayarlar if their shop uses different IDs.
 */
export const DEFAULT_ETSY_PROPERTY_SIZE_ID = "513";
export const DEFAULT_ETSY_PROPERTY_PAPER_QUALITY_ID = "514";

/**
 * Listing property keys used by the publish service. Each maps to one or more
 * `ETSY_PROPERTY_*` env vars set from Ayarlar.
 */
export const LISTING_PROPERTY_KEYS = {
  aspectRatio: {
    label: "Aspect Ratio",
    idKey: "ETSY_PROPERTY_ASPECT_RATIO_ID",
    valueKeys: {
      "2:3": "ETSY_PROPERTY_ASPECT_RATIO_VALUE_2_3",
      "3:4": "ETSY_PROPERTY_ASPECT_RATIO_VALUE_3_4",
      "4:5": "ETSY_PROPERTY_ASPECT_RATIO_VALUE_4_5",
      "5:7": "ETSY_PROPERTY_ASPECT_RATIO_VALUE_5_7",
      "11:14": "ETSY_PROPERTY_ASPECT_RATIO_VALUE_11_14",
      "1:1": "ETSY_PROPERTY_ASPECT_RATIO_VALUE_1_1",
    },
  },
  pieces: {
    label: "Pieces (Set Boyutu)",
    idKey: "ETSY_PROPERTY_PIECES_ID",
    valueKeys: {
      "1": "ETSY_PROPERTY_PIECES_VALUE_ONE",
      "2": "ETSY_PROPERTY_PIECES_VALUE_TWO",
      "3": "ETSY_PROPERTY_PIECES_VALUE_THREE",
    },
  },
  framing: {
    label: "Framing",
    idKey: "ETSY_PROPERTY_FRAMING_ID",
    valueKeys: {
      Unframed: "ETSY_PROPERTY_FRAMING_VALUE_UNFRAMED",
    },
  },
  orientation: {
    label: "Orientation",
    idKey: "ETSY_PROPERTY_ORIENTATION_ID",
    valueKeys: {
      Vertical: "ETSY_PROPERTY_ORIENTATION_VALUE_VERTICAL",
      Horizontal: "ETSY_PROPERTY_ORIENTATION_VALUE_HORIZONTAL",
      Square: "ETSY_PROPERTY_ORIENTATION_VALUE_SQUARE",
    },
  },
  subject: {
    label: "Subject (opsiyonel)",
    idKey: "ETSY_PROPERTY_SUBJECT_ID",
    valueKeys: {},
  },
} as const;
