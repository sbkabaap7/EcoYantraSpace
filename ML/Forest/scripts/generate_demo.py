from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SIZE = 640


def terrain() -> Image.Image:
    image = Image.new("RGB", (SIZE, SIZE), "#9e865a")
    draw = ImageDraw.Draw(image)
    for y in range(0, SIZE, 12):
        shade = 145 + (y // 12) % 20
        draw.rectangle((0, y, SIZE, y + 12), fill=(shade, 126, 82))
    draw.line([(20, 570), (190, 420), (300, 445), (470, 260), (620, 210)], fill="#637d8d", width=20)
    return image.filter(ImageFilter.GaussianBlur(2))


def forest(image: Image.Image, regions: list[tuple[int, int, int, int]]) -> None:
    draw = ImageDraw.Draw(image)
    for x0, y0, x1, y1 in regions:
        for x in range(x0, x1, 12):
            for y in range(y0, y1, 12):
                draw.ellipse((x - 8, y - 8, x + 11, y + 11), fill="#397044")
                draw.ellipse((x - 3, y - 5, x + 8, y + 8), fill="#4c8b50")


def main() -> None:
    before = terrain(); after = terrain()
    shared = [(55, 65, 260, 280), (390, 340, 590, 560)]
    forest(before, shared + [(320, 70, 540, 250)])
    forest(after, shared + [(80, 365, 250, 520)])
    output = ROOT / "frontend"; output.mkdir(exist_ok=True)
    before.save(output / "demo_before.png", optimize=True)
    after.save(output / "demo_after.png", optimize=True)


if __name__ == "__main__":
    main()

