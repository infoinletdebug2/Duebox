"""Compose App Store screenshots: headline + ticks (brand fonts, drawn in code so the
spelling is exact) over the Codex phone art. Output: out/<name>.jpg at 1290x2796
(APP_IPHONE_67), 24-bit JPEG with no alpha, as Apple requires.

    python -I compose.py            # every art/*.png that has copy below
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, '..', 'mobile', 'node_modules', '@expo-google-fonts')
DISPLAY = os.path.join(FONTS, 'bricolage-grotesque', '700Bold', 'BricolageGrotesque_700Bold.ttf')
BODY = os.path.join(FONTS, 'manrope', '600SemiBold', 'Manrope_600SemiBold.ttf')

PLUM = (46, 26, 71)
WHITE = (255, 255, 255)
MARIGOLD = (242, 179, 61)
SOFT = (214, 203, 230)

# Each headline line is a list of (text, accent?) runs.
COPY = {
    '1-hero': {
        'lines': [[('Never miss a', False)], [('deadline', True), (' again', False)]],
        'ticks': ['Snap any letter or bill', 'AI finds the due date', 'Reminded 30, 7 and 1 days before'],
    },
    'hero-a': {
        'lines': [[('Paper chaos in.', False)], [('Calm', True), (' deadlines out.', False)]],
        'ticks': ['Snap letters, bills and forms', 'AI finds every due date', 'Reminded 30, 7 and 1 days before', 'Shared with your household'],
    },
    'hero-b': {
        'lines': [[('Every', False), (' deadline,', True)], [('one calm place', False)]],
        'ticks': ['Snap letters, bills and forms', 'AI finds every due date', 'Reminded 30, 7 and 1 days before', 'Shared with your household'],
    },
    'hero-c': {
        'lines': [[('Snap the letter.', False)], [('We', False), ('’', False), ('ll', False), (' remember', True)], [('the date.', False)]],
        'ticks': ['AI finds every due date', 'Reminded 30, 7 and 1 days before', 'Shared with your household'],
    },
    '2-read': {
        'lines': [[('AI reads it.', False)], [('You see why.', True)]],
        'ticks': ['Shows the exact words it found', 'Fix anything in one tap', 'You always have the final say'],
    },
    '3-remind': {
        'lines': [[('Reminded', False), (' before,', True)], [('not on the day', False)]],
        'ticks': ['30, 7 and 1 days ahead', 'Mark done or snooze from the alert', 'Repeating bills plan themselves'],
    },
    '4-household': {
        'lines': [[('Share it with', False)], [('your', False), (' household', True)]],
        'ticks': ['Invite up to 5 people', 'Assign who handles what', 'Everyone gets the reminders'],
    },
    '5-items': {
        'lines': [[('Every', False), (' deadline,', True)], [('in one place', False)]],
        'ticks': ['Bills, renewals, trials and forms', 'Search and sort by category', 'Repeating ones schedule themselves'],
    },
    '6-scan': {
        'lines': [[('Camera, photos', False)], [('or', False), (' PDF', True)]],
        'ticks': ['Letters, bills, forms and screenshots', 'Up to 5 pages at once', 'Or type it in yourself'],
    },
    '7-time': {
        'lines': [[('Reminders at', False)], [('your', False), (' time', True)]],
        'ticks': ['Pick the hour that suits you', 'One calm nudge on reminder days', 'Your own timing per deadline'],
    },
    '8-privacy': {
        'lines': [[('Your data,', False)], [('always', True), (' yours', False)]],
        'ticks': ['Private to your household', 'Export everything, always free', 'Delete your account anytime'],
    },
}
IPAD = {'ipad-1-hero': 'hero-c', 'ipad-2-read': '2-read', 'ipad-3-remind': '3-remind', 'ipad-4-household': '4-household', 'ipad-5-items': '5-items'}
COPY.update({ipad: COPY[phone] for ipad, phone in IPAD.items()})


# iPhone 6.7" (APP_IPHONE_67) and iPad 13" (APP_IPAD_PRO_3GEN_129). The iPad
# art is square, drawn narrower than the canvas and feathered into it.
DEVICES = {
    'iphone': {'W': 1290, 'H': 2796, 'art_w': 1290, 'k': 1.0},
    'ipad': {'W': 2048, 'H': 2732, 'art_w': 2048, 'k': 1.0},
}


def feathered(art, edge):
    """A mask that fades the art's left, right and top edges into the background."""
    w, h = art.size
    mask = Image.new('L', (w, h), 255)
    px = mask.load()
    for x in range(w):
        fx = min(1.0, x / edge, (w - 1 - x) / edge)
        for y in range(0, h, 1):
            fy = min(1.0, y / edge)
            v = int(255 * fx * fy)
            if v < 255:
                px[x, y] = v
    return mask


def compose(name, spec):
    dev = DEVICES['ipad' if name.startswith('ipad-') else 'iphone']
    W, H, k = dev['W'], dev['H'], dev['k']
    art = Image.open(os.path.join(HERE, 'art', name + '.png')).convert('RGB')
    aw = dev['art_w']
    art = art.resize((aw, round(art.height * aw / art.width)), Image.LANCZOS)
    top, left = H - art.height, (W - aw) // 2

    # Background = the art's own colours (top centre down to its bottom corners), so seams disappear.
    c_top = art.getpixel((aw // 2, 8))
    c_bot = art.getpixel((4, art.height - 4))
    canvas = Image.new('RGB', (W, H), c_top)
    if left:
        # Margins continue the art's own edge colours, row by row.
        grad = Image.new('RGB', (W, H), c_top)
        gd = ImageDraw.Draw(grad)
        for y in range(top, H):
            ay = y - top
            gd.line([(0, y), (left + 20, y)], fill=art.getpixel((2, ay)))
            gd.line([(left + aw - 20, y), (W, y)], fill=art.getpixel((aw - 3, ay)))
        canvas = grad
        canvas.paste(art, (left, top), feathered(art, 140))
    else:
        canvas.paste(art, (0, top))
        # Soft fade over the seam.
        fade = 160
        for i in range(fade):
            a = 1 - i / fade
            row = canvas.crop((0, top + i, W, top + i + 1))
            canvas.paste(Image.blend(row, Image.new('RGB', (W, 1), c_top), a), (0, top + i))

    d = ImageDraw.Draw(canvas)
    margin = round(96 * k)
    size = round(132 * k)
    while True:
        head = ImageFont.truetype(DISPLAY, size)
        widest = max(sum(d.textlength(t, font=head) for t, _ in line) for line in spec['lines'])
        if widest <= W - 2 * margin or size <= 96:
            break
        size -= 4
    many = len(spec['ticks']) > 3 or len(spec['lines']) > 2
    body = ImageFont.truetype(BODY, round((46 if many else 50) * k))
    step = round((70 if many else 78) * k)
    lh = round(150 * k)
    block = lh * len(spec['lines']) + round(40 * k) + step * len(spec['ticks'])
    x, y = margin, max(70, min(round(190 * k), top - 20 - block))
    for line in spec['lines']:
        cx = x
        for text, accent in line:
            d.text((cx, y), text, font=head, fill=MARIGOLD if accent else WHITE)
            cx += d.textlength(text, font=head)
        y += lh
    y += round(40 * k)
    for tick in spec['ticks']:
        r = round(20 * k)
        cy = y + round(30 * k)
        d.ellipse((x, cy - r, x + 2 * r, cy + r), fill=MARIGOLD)
        d.line([(x + round(11 * k), cy + 1), (x + round(18 * k), cy + round(8 * k)), (x + round(30 * k), cy - round(7 * k))], fill=PLUM, width=round(6 * k), joint='curve')
        d.text((x + 2 * r + round(26 * k), y), tick, font=body, fill=SOFT)
        y += step

    out = os.path.join(HERE, 'out', name + '.jpg')
    canvas.save(out, 'JPEG', quality=94)
    print(out, canvas.size, canvas.mode, 'art top at y =', top, 'text ends at y =', y)


for name, spec in COPY.items():
    if os.path.exists(os.path.join(HERE, 'art', name + '.png')):
        compose(name, spec)
    else:
        print('no art yet:', name)
