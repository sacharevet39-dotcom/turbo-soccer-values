"""Crop each square item thumbnail from the supplied Turbo Soccer screenshots.

Requires Pillow. Original screenshots are read only; cropped WEBP files and a
TypeScript image manifest are written into the app.
"""

from pathlib import Path
from PIL import Image, ImageDraw

SOURCE = Path(r"C:\Users\sacha\Downloads\Turbo Soccer")
PROJECT = Path(__file__).resolve().parents[1]
OUT = PROJECT / "public" / "catalog" / "crops"
MANIFEST = PROJECT / "src" / "catalogImages.ts"
PREVIEW = PROJECT / "scripts" / "catalog-contact-sheet.jpg"
SIDE = 180
ADDITIONAL_IMAGES = [
    f"/catalog/community/{name}.webp"
    for name in (
        "beta-ballon", "beta-boost", "beta-explosion", "beta-joueur",
        "beta-lunettes", "beta-mi-bombo", "beta-roue", "beta-swag",
        "beta-trainee", "halloween-flamme", "halloween-pluie",
        "halloween-potion", "halloween-sort", "halloween-zumba",
    )
]

SHEETS = [
    ("Capture_decran_2026-10-26_a_15.51.35.webp", [27, 251, 474, 698, 922, 1145, 1369]),
    ("Capture_decran_2026-10-26_a_15.51.45.webp", [23, 247, 470, 694, 918, 1141, 1365]),
    ("Capture_decran_2026-10-26_a_15.51.51.webp", [5, 229, 452, 676, 900, 1123, 1347]),
    ("Capture_decran_2026-10-26_a_15.51.58.webp", [13, 237, 460, 684, 908, 1131, 1355]),
    ("Capture_decran_2026-10-26_a_15.52.03.webp", [17, 241, 464, 688, 912, 1135, 1359]),
]


def card_rows(image: Image.Image) -> list[int]:
    """Find the two long rows of image tiles by their contrast to the purple UI."""
    image = image.convert("RGB")
    background = image.getpixel((0, 0))
    widths = []
    pixels = image.load()
    for y in range(image.height):
        count = 0
        for x in range(image.width):
            color = pixels[x, y]
            if sum(abs(color[i] - background[i]) for i in range(3)) > 70:
                count += 1
        widths.append(count)

    spans: list[tuple[int, int]] = []
    start = None
    for y, count in enumerate(widths + [0]):
        if count > 650 and start is None:
            start = y
        elif count <= 650 and start is not None:
            if y - start > 80:
                spans.append((start, y - 1))
            start = None
    if len(spans) != 2:
        raise RuntimeError(f"Expected two thumbnail rows; found {spans}")
    # The screenshots include a few hover/shadow pixels around cards. Use the
    # last 180 pixels of each row to capture each square tile consistently.
    return [end - SIDE + 1 for _, end in spans]


def remove_cursor(tile: Image.Image, sheet_no: int, item_no: int) -> Image.Image:
    """Retouch the three visible mouse pointers from the source screenshots."""
    tile = tile.copy()
    if (sheet_no, item_no) == (1, 12):
        # This pointer is in the lower-left corner. A tighter crop keeps the pot
        # centered and removes the cursor and the card's lower border.
        return tile.crop((40, 0, SIDE, 140)).resize((SIDE, SIDE), Image.Resampling.LANCZOS)
    if (sheet_no, item_no) == (4, 14):
        # The second pointer sits at bottom left over a bright effects tile.
        return tile.crop((66, 0, SIDE, 114)).resize((SIDE, SIDE), Image.Resampling.LANCZOS)
    elif (sheet_no, item_no) == (5, 13):
        # The wheel hub is partly hidden by a bright-yellow cursor. Mask that
        # cursor and reconstruct the small hub area from its immediate edges.
        try:
            import cv2
            import numpy as np
        except ImportError:
            return tile
        rgb = np.asarray(tile)
        hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
        mask = cv2.inRange(hsv, np.array([14, 105, 100]), np.array([42, 255, 255]))
        mask[145:, :] = 0
        mask[:, 140:] = 0
        mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)), iterations=1)
        cleaned = cv2.inpaint(rgb, mask, 7, cv2.INPAINT_TELEA)
        return Image.fromarray(cleaned)
    return tile


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    entries: list[str] = []
    crops: list[Image.Image] = []
    for sheet_no, (filename, x_positions) in enumerate(SHEETS, start=1):
        image = Image.open(SOURCE / filename).convert("RGB")
        y_positions = card_rows(image)
        for row_no, y in enumerate(y_positions, start=1):
            for column_no, x in enumerate(x_positions, start=1):
                if x < 0 or y < 0 or x + SIDE > image.width or y + SIDE > image.height:
                    raise RuntimeError(f"Crop outside {filename}: {(x, y, SIDE, SIDE)}")
                path = f"/catalog/crops/sheet-{sheet_no:02d}-item-{(row_no-1)*7+column_no:02d}.webp"
                item_no = (row_no - 1) * 7 + column_no
                tile = image.crop((x, y, x + SIDE, y + SIDE))
                tile = remove_cursor(tile, sheet_no, item_no)
                if (sheet_no, item_no) not in {(1, 12), (4, 14)}:
                    # Keep the artwork and leave out the color-swatch controls
                    # shown below some items in the source website screenshots.
                    tile = tile.crop((24, 0, 156, 132)).resize((SIDE, SIDE), Image.Resampling.LANCZOS)
                tile.save(
                    PROJECT / "public" / path.lstrip("/"), "WEBP", quality=92, method=6
                )
                entries.append(path)
                crops.append(tile)

    legacy_images = [
        "/catalog/Capture_decran_2026-10-26_a_15.51.35.webp",
        "/catalog/Capture_decran_2026-10-26_a_15.51.45.webp",
        "/catalog/Capture_decran_2026-10-26_a_15.51.51.webp",
        "/catalog/Capture_decran_2026-10-26_a_15.51.58.webp",
        "/catalog/Capture_decran_2026-10-26_a_15.52.03.webp",
    ]
    image_entries = [*legacy_images, *entries, *ADDITIONAL_IMAGES]
    lines = ["// Generated by scripts/crop_catalog.py; images stay manually assignable.",
             "export const sourceImages = [", *[f"  {path!r}," for path in image_entries], "] as const;", ""]
    MANIFEST.write_text("\n".join(lines), encoding="utf-8")

    thumb = 102
    label_h = 19
    columns = 10
    rows = (len(crops) + columns - 1) // columns
    preview = Image.new("RGB", (columns * (thumb + 8) + 8, rows * (thumb + label_h + 8) + 8), "#2f0a62")
    draw = ImageDraw.Draw(preview)
    for i, crop in enumerate(crops):
        col, row = i % columns, i // columns
        x, y = 8 + col * (thumb + 8), 8 + row * (thumb + label_h + 8)
        preview.paste(crop.resize((thumb, thumb), Image.Resampling.LANCZOS), (x, y))
        draw.text((x + 3, y + thumb + 2), f"{i+1:02d}", fill="#fff")
    preview.save(PREVIEW, quality=88)
    print(f"Created {len(entries)} crops from {len(SHEETS)} screenshots.")
    print(f"Manifest: {MANIFEST}")
    print(f"Contact sheet: {PREVIEW}")


if __name__ == "__main__":
    main()
