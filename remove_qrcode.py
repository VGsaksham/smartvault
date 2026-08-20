import re

filepath = 'src/components/MainDashboard.tsx'
with open(filepath, 'r', encoding='utf8') as f:
    content = f.read()

content = re.sub(r'<QRCodeSVG[^>]*/>', '<QrCode className="text-[var(--text-secondary)] opacity-30" />', content)

with open(filepath, 'w', encoding='utf8') as f:
    f.write(content)
