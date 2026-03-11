export function preloadBundleUsesUnsupportedModuleSyntax(source: string): boolean {
    return source.split(/\r?\n/u).some((line) => {
        const trimmedLine = line.trimStart();
        return (
            trimmedLine.startsWith('import ') ||
            trimmedLine.startsWith("import '") ||
            trimmedLine.startsWith('import "') ||
            trimmedLine.startsWith('export ')
        );
    });
}
