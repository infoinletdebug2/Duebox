"""Contact sheets: every screenshot, 4 per row, so a whole run can be looked at
in a few images.  python harness/sheet.py [shots|shots-dark]"""
import sys, glob, os
from PIL import Image, ImageDraw

here = os.path.dirname(os.path.abspath(__file__))
folder = os.path.join(here, sys.argv[1] if len(sys.argv) > 1 else 'shots')
files = sorted(f for f in glob.glob(os.path.join(folder, '*.png')) if not os.path.basename(f).startswith('sheet'))
W, H, COLS, PER = 393, 852, 4, 8
for n in range(0, len(files), PER):
    chunk = files[n:n + PER]
    rows = (len(chunk) + COLS - 1) // COLS
    sheet = Image.new('RGB', (COLS * (W + 12), rows * (H + 34)), 'white')
    d = ImageDraw.Draw(sheet)
    for i, f in enumerate(chunk):
        im = Image.open(f).convert('RGB')
        im = im.crop((0, 0, im.width, min(im.height, int(im.width * H / W))))
        im = im.resize((W, int(im.height * W / im.width)))
        x, y = (i % COLS) * (W + 12), (i // COLS) * (H + 34)
        sheet.paste(im, (x, y + 28))
        d.text((x + 4, y + 6), os.path.basename(f), fill='black')
    sheet.save(os.path.join(folder, f'sheet-{n // PER + 1}.png'))
print('ok', len(files))
