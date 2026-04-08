import fs from 'node:fs';

export function loadModule(filePath, injected = {}, exportNames = []) {
    let source = fs.readFileSync(filePath, 'utf8');

    source = source.replace(/^import\s+[^;]+;\s*$/gm, '');
    source = source.replace(/export\s+async\s+function\s+/g, 'async function ');
    source = source.replace(/export\s+function\s+/g, 'function ');
    source = source.replace(/export\s+const\s+/g, 'const ');
    source = source.replace(/export\s+let\s+/g, 'let ');

    const argNames = Object.keys(injected);
    const argValues = Object.values(injected);
    const factory = new Function(
        ...argNames,
        `${source}\nreturn { ${exportNames.join(', ')} };`
    );

    return factory(...argValues);
}
