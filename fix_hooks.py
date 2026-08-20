import re

with open('src/components/MainDashboard.tsx', 'r', encoding='utf8') as f:
    content = f.read()

# The top of the component
match = re.search(r'export default function MainDashboard\(\) {\n', content)
start_idx = match.end()

# The lines we will examine
lines = content[start_idx:].split('\n')

hooks = []
remaining_lines = []

in_function_body = False

for line in lines:
    # A simple heuristic for function declarations that indicate we've left the "top level hook section"
    if re.search(r'^\s*(const|let|function|var)\s+\w+\s*=\s*(async\s*)?\([^)]*\)\s*=>|^\s*function\s+\w+\s*\(', line):
        in_function_body = True
    
    # If we are inside the function body and we find a useState hook (that is single-line)
    if in_function_body and re.search(r'^\s*const\s+\[[\w,\s]+\]\s*=\s*useState<[^>]*>\([^)]*\);|^\s*const\s+\[[\w,\s]+\]\s*=\s*useState\([^)]*\);', line):
        hooks.append(line)
        continue
        
    remaining_lines.append(line)

# Now, insert the hooks at the very beginning
new_content = content[:start_idx] + '\n'.join(hooks) + '\n' + '\n'.join(remaining_lines)

with open('src/components/MainDashboard.tsx', 'w', encoding='utf8') as f:
    f.write(new_content)

print(f"Moved {len(hooks)} hooks.")
