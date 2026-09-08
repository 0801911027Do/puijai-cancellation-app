import os
import sys

# clean_images.py
# Removes all dark/black accessibility backgrounds from LINE step guide images
# Produces crystal-clear, authentic LINE visuals with zero black contour pills.

try:
    # pyrefly: ignore [missing-import]
    # pyrefly: ignore [missing-import]
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("PIL/Pillow is required. Please run with Python 3.14 (py clean_images.py)")
    sys.exit(1)

font_path = 'C:/Windows/Fonts/leelawad.ttf'
font_bold_path = 'C:/Windows/Fonts/leelawdb.ttf'

font_xs = ImageFont.truetype(font_path, 11)
font_sm = ImageFont.truetype(font_path, 13)
font_md = ImageFont.truetype(font_path, 15)
font_item = ImageFont.truetype(font_path, 18)
font_title = ImageFont.truetype(font_bold_path, 21)
font_xl = ImageFont.truetype(font_bold_path, 20)
font_btn_red = ImageFont.truetype(font_bold_path, 19)
font_sub = ImageFont.truetype(font_path, 13)

def draw_chevron(draw, x, y, color=(160, 174, 192, 255), size=9, width=2):
    draw.line([(x, y - size), (x + size * 0.7, y), (x, y + size)], fill=color, width=width)

def draw_back_arrow(draw, x, y, color=(20, 20, 20, 255), size=11, width=3):
    draw.line([(x + size * 0.7, y - size), (x, y), (x + size * 0.7, y + size)], fill=color, width=width)

print("Starting clean_images.py: Processing all 4 guide steps...")

# ==========================================
# 1. CLEAN STEP 1 (public/line-step1.png)
# ==========================================
if os.path.exists('public/line-step1.png'):
    im1 = Image.open('public/line-step1.png').convert('RGBA')
    draw1 = ImageDraw.Draw(im1)

    # 1.1 Wipe entire top status bar (y: 0..52) to clean white
    draw1.rectangle([0, 0, 475, 52], fill=(255, 255, 255, 255))

    # 1.2 Wipe header title area (x: 50..250, y: 50..122)
    draw1.rectangle([50, 50, 250, 122], fill=(255, 255, 255, 255))
    draw1.text((62, 54), 'Puijai', font=font_title, fill=(15, 23, 42, 255))

    # 1.3 Clean badge for "ผู้รับผิดชอบเป็นผู้ตอบกลับ" (Soft light pill, zero black contour)
    draw1.rounded_rectangle([62, 90, 224, 115], radius=12, fill=(241, 245, 249, 255), outline=(203, 213, 225, 255), width=1)
    draw1.text((75, 94), 'ผู้รับผิดชอบเป็นผู้ตอบกลับ', font=font_xs, fill=(100, 116, 139, 255))

    # 1.4 Wipe timestamps and redraw clean text directly on chat background
    chat_bg = (140, 171, 217, 255)
    # Timestamp 1
    draw1.rectangle([365, 275, 435, 315], fill=chat_bg)
    draw1.text((375, 288), '23:50 น.', font=font_xs, fill=(255, 255, 255, 240))

    # Timestamp 2
    draw1.rectangle([365, 400, 445, 445], fill=chat_bg)
    draw1.text((375, 418), '23:50 น.', font=font_xs, fill=(255, 255, 255, 240))

    # 1.5 Wipe bottom Android bar (x: 0..475, y: 960..1024)
    draw1.rectangle([0, 960, 475, 1024], fill=(255, 255, 255, 255))

    im1.save('public/line-step1.png')
    print("Step 1 cleaned: Status bar, header, badge, and timestamps 100% clean!")

# ==========================================
# 2. CLEAN STEP 2 (public/line-step2.png)
# ==========================================
if os.path.exists('public/line-step2.png'):
    im2 = Image.open('public/line-step2.png').convert('RGBA')
    draw2 = ImageDraw.Draw(im2)

    # Wipe top status bar
    draw2.rectangle([0, 0, 475, 52], fill=(255, 255, 255, 255))

    # Wipe [@123xuwni] area and replace with clean subtle text
    draw2.rectangle([50, 90, 160, 125], fill=(255, 255, 255, 255))
    draw2.text((62, 97), "@123xuwni", font=font_xs, fill=(100, 116, 139, 255))

    # Wipe "ไม่พบรูปหรือวิดีโอ" container text area
    draw2.rectangle([160, 395, 315, 435], fill=(244, 245, 247, 255))
    draw2.text((182, 404), "ไม่พบรูปหรือวิดีโอ", font=font_sm, fill=(148, 163, 184, 255))

    # Wipe bottom Android bar
    draw2.rectangle([0, 960, 475, 1024], fill=(255, 255, 255, 255))

    im2.save('public/line-step2.png')
    print("Step 2 cleaned: All black boxes eliminated!")

# ==========================================
# 3. GENERATE PERFECT STEP 3 (Chat Settings)
# ==========================================
im3 = Image.new('RGBA', (475, 1024), (255, 255, 255, 255))
d3 = ImageDraw.Draw(im3)

# Header: Back arrow + "ตั้งค่า"
draw_back_arrow(d3, 30, 85, color=(20, 20, 20, 255), size=10, width=3)
d3.text((65, 72), "ตั้งค่า", font=font_title, fill=(20, 20, 20, 255))

# Item 1: การแจ้งเตือนเกี่ยวกับโน้ต + Toggle Switch
d3.text((22, 142), "การแจ้งเตือนเกี่ยวกับโน้ต", font=font_item, fill=(20, 20, 20, 255))
d3.text((22, 174), "รับการแจ้งเตือนเมื่อมีผู้แสดงความคิดเห็นหรือความรู้สึกต่อโน้ต", font=font_sub, fill=(148, 163, 184, 255))
d3.text((22, 195), "ของคุณ", font=font_sub, fill=(148, 163, 184, 255))

# Green toggle switch (active)
toggle_box = [405, 142, 452, 168]
d3.rounded_rectangle(toggle_box, radius=13, fill=(34, 197, 94, 255))
d3.ellipse([427, 144, 450, 166], fill=(255, 255, 255, 255))

# Divider
d3.line([(22, 260), (455, 260)], fill=(241, 245, 249, 255), width=1)

# Item 2: วอลล์เปเปอร์
d3.text((22, 305), "วอลล์เปเปอร์", font=font_item, fill=(20, 20, 20, 255))
draw_chevron(d3, 442, 315)

# Item 3: สำรองประวัติการแชท
d3.text((22, 375), "สำรองประวัติการแชท", font=font_item, fill=(20, 20, 20, 255))
d3.text((22, 408), "สำรองประวัติการแชทเป็นไฟล์ข้อความ", font=font_sub, fill=(148, 163, 184, 255))
draw_chevron(d3, 442, 385)

# Item 4: ลบข้อมูล (HIGHLIGHT TARGET)
d3.text((22, 475), "ลบข้อมูล", font=font_item, fill=(20, 20, 20, 255))
draw_chevron(d3, 442, 485)

# Item 5: สร้างทางลัดห้องแชท
d3.text((22, 545), "สร้างทางลัดห้องแชท", font=font_item, fill=(20, 20, 20, 255))
d3.text((22, 578), "สร้างทางลัดสำหรับเพื่อนหรือกลุ่มที่แชทหรือโทรด้วยบนหน้า", font=font_sub, fill=(148, 163, 184, 255))
d3.text((22, 599), "หลัก", font=font_sub, fill=(148, 163, 184, 255))
draw_chevron(d3, 442, 555)

# Item 6: รายงานปัญหา
d3.text((22, 665), "รายงานปัญหา", font=font_item, fill=(20, 20, 20, 255))
draw_chevron(d3, 442, 675)

im3.save('public/line-step3.png')
print("Step 3 generated cleanly without ANY black blobs!")

# ==========================================
# 4. GENERATE PERFECT STEP 4 (Delete Data Screen)
# ==========================================
im4 = Image.new('RGBA', (475, 1024), (255, 255, 255, 255))
d4 = ImageDraw.Draw(im4)

# Header: Back arrow + "ลบข้อมูล"
draw_back_arrow(d4, 30, 85, color=(20, 20, 20, 255), size=10, width=3)
d4.text((65, 72), "ลบข้อมูล", font=font_title, fill=(20, 20, 20, 255))

# 4 Storage Rows
rows = [
    ("รูป", 160),
    ("วิดีโอ", 230),
    ("ข้อความเสียง", 300),
    ("ไฟล์", 370),
]

for label, y in rows:
    # Item label
    d4.text((24, y + 5), label, font=font_item, fill=(20, 20, 20, 255))
    
    # Clean 0KB text (no black bubble!)
    d4.text((260, y + 7), "0KB", font=font_item, fill=(148, 163, 184, 255))
    
    # Clean [ ลบ ] button (gray border, gray text, NO black inside!)
    btn_rect = [395, y, 455, y + 36]
    d4.rounded_rectangle(btn_rect, radius=9, fill=(255, 255, 255, 255), outline=(226, 232, 240, 255), width=1)
    d4.text((415, y + 8), "ลบ", font=font_sm, fill=(100, 116, 139, 255))

# Divider
d4.line([(22, 435), (455, 435)], fill=(241, 245, 249, 255), width=1)

# RED BUTTON ACTION: "ลบข้อมูลแชทและข้อความแชททั้งหมด"
# Clean, crisp red text on pure white background (NO black blob!)
d4.text((24, 480), "ลบข้อมูลแชทและข้อความแชททั้งหมด", font=font_btn_red, fill=(225, 29, 72, 255))
d4.text((24, 514), "ข้อมูลแชทและข้อความแชททั้งหมดจะถูกลบ", font=font_sub, fill=(100, 116, 139, 255))

im4.save('public/line-step4.png')
print("Step 4 generated cleanly without ANY black blobs!")

print("All 4 steps are completely clean: 0 black boxes, 0 accessibility artifacts!")
