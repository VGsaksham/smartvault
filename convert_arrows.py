import re
import sys

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf8') as f:
        content = f.read()
    
    # Replace arrow functions: const myFunc = (args) => {
    # We need to handle async too: const myFunc = async (args) => {
    
    # Simple regex to replace: const <name> = (<args>) => {
    # with: function <name>(<args>) {
    
    # We will use a function to do the regex substitution carefully.
    
    def repl(match):
        is_async = match.group(1) or ""
        name = match.group(2)
        args = match.group(3)
        return f"{is_async} function {name}({args}) {{"
    
    # Matches: const name = (args) => {
    # Also handles async
    new_content = re.sub(r'const\s+([a-zA-Z0-9_]+)\s*=\s*(async\s*)?\(([^)]*)\)\s*=>\s*\{', 
                         lambda m: f"{m.group(2) or ''} function {m.group(1)}({m.group(3)}) {{", 
                         content)
                         
    # Matches: const name = async e => {
    new_content = re.sub(r'const\s+([a-zA-Z0-9_]+)\s*=\s*(async\s+)?([a-zA-Z0-9_]+)\s*=>\s*\{', 
                         lambda m: f"{m.group(2) or ''} function {m.group(1)}({m.group(3)}) {{", 
                         new_content)
    
    with open(filepath, 'w', encoding='utf8') as f:
        f.write(new_content)

fix_file('src/components/MainDashboard.tsx')
fix_file('src/components/CategoryDashboard.tsx')
