const fs = require('fs');
const path = require('path');
const validArgs = new Set(['--verbose', '--directory', '--file', '--help']);
let verboseMode = false;

/**
 * Parses CLI arguments and handles help and validation.
 * 
 * @returns {string[]}
 */
function getCLIArgs() {
    const args = process.argv.slice(2);
    // If `--help` is provided, show usage information
    if (args.includes('--help')) {
        logToConsole('Usage: node references.js [options]', 'notice');
        logToConsole('Defaults to checking all markdown files in the current directory.\n', 'notice');
        logToConsole('Options:', 'notice');
        logToConsole('  --help              Show this help message', 'notice');
        logToConsole('  --file <path>       Specify a markdown file to check', 'notice');
        logToConsole('  --directory <path>  Specify a directory to check', 'notice');
        logToConsole('  --verbose           Be more verbose', 'notice');
        process.exit(0);
    }
    // Check for verbose mode
    if (args.includes('--verbose')) {
        verboseMode = true;
    }
    // Validate arguments
    for (const arg of args) {
        if (!validArgs.has(arg) && !fs.existsSync(arg)) {
            logToConsole(`Invalid argument or file does not exist: ${arg}`, 'error');
            process.exit(1);
        }
    }
    // Check that only one of --file or --directory is provided
    if (args.includes('--file') && args.includes('--directory')) {
        logToConsole('Please provide only one of --file or --directory.', 'error');
        process.exit(1);
    }

    return args;
}

/**
 * Determines the file or directory path from CLI arguments.
 *
 * @returns {string}
 */
function getFilePath() {
    const args = getCLIArgs();
    
    // Check for --file flag
    const fileIndex = args.indexOf('--file');
    if (fileIndex !== -1 && args[fileIndex + 1]) {
        const filePath = args[fileIndex + 1];
        return path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    }
    
    // Check for --directory flag
    const dirIndex = args.indexOf('--directory');
    if (dirIndex !== -1 && args[dirIndex + 1]) {
        const dirPath = args[dirIndex + 1];
        return path.isAbsolute(dirPath) ? dirPath : path.join(process.cwd(), dirPath);
    }
    
    // Default to current directory
    return process.cwd();
}

/**
 * Extracts all reference numbers from markdown content (e.g., [^1], [^2]).
 *
 * @param {string} content
 *
 * @returns {Map<string, number[]>}
 */
function extractReferences(content) {
    const references = new Map();
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
        let match;
        const lineRegex = /\[\^(\d+)\]/g;
        while ((match = lineRegex.exec(line)) !== null) {
            const referenceNum = match[1];
            if (!references.has(referenceNum)) {
                references.set(referenceNum, []);
            }
            references.get(referenceNum).push(index + 1);
        }
    });

    if (verboseMode) {
        logToConsole(`ref: ${Array.from(references.keys()).join(', ')}`, 'verbose');
    }

    return references;
}

/**
 * Extracts all reference definition numbers from markdown content (e.g., [^1]: ...).
 *
 * @param {string} content
 *
 * @returns {Set<string>}
 */
function extractDefinitions(content) {
    const definitionRegex = /^\[\^(\d+)\]:\s+.+$/gm;
    const definitions = new Set();
    let match;
    
    while ((match = definitionRegex.exec(content)) !== null) {
        definitions.add(match[1]);
    }

    if (verboseMode) {
        logToConsole(`def: ${Array.from(definitions).join(', ')}`, 'verbose');
    }
    
    return definitions;
}

/**
 * Compares reference with definitions to find any missing reference definitions.
 *
 * @param {Map<string, number[]>} references
 * @param {Set<string>} definitions
 *
 * @returns {Array<{num: string, lines: number[]}>}
 */
function findMissingDefinitions(reference, definitions) {
    const missing = Array.from(reference.entries())
        .filter(([num]) => !definitions.has(num))
        .map(([num, lines]) => ({ num, lines }))
        .sort((a, b) => parseInt(a.num) - parseInt(b.num));

    if (verboseMode && missing.length > 0) {
        logToConsole(`missing: ${missing.map(m => m.num).join(', ')}`, 'verbose');
    }
    
    return missing;
}

/**
 * Checks a markdown file for missing reference definitions.
 *
 * @param {string} filePath
 *
 * @returns {Array<{num: string, lines: number[]}>}
 */
function checkReferences(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const references = extractReferences(content);
    const definitions = extractDefinitions(content);
    const missing = findMissingDefinitions(references, definitions);
    
    return missing;
}

/**
 * Processes a single markdown file and checks their references.
 *
 * @param {string} filePath
 *
 * @returns {boolean}
 */
function processFile(filePath) {
    logToConsole(`Checking references in ${path.basename(filePath)} ...`);
    const missing = checkReferences(filePath);
    
    if (missing.length === 0) {
        logToConsole('✓ All references have definitions', 'success');
        return true;
    } else {
        logToConsole('✗ Missing reference definitions:', 'error');
        missing.forEach(({ num, lines }) => {
            const lineStr = lines.length === 1
                ? `line ${lines[0]}`
                : `lines ${lines.join(', ')}`;
            logToConsole(`  [^${num}] on ${lineStr}`, 'notice');
        });
        return false;
    }
}

/**
 * Processes all markdown files in a directory and checks their references.
 *
 * @param {string} dirPath
 *
 * @returns {boolean}
 */
function processDirectory(dirPath) {
    logToConsole(`Checking all markdown files in directory: ${dirPath} ...`);
    const files = fs.readdirSync(dirPath).filter(file => file.endsWith('.md'));
    
    if (files.length === 0) {
        logToConsole(`No markdown files found in ${dirPath}`, 'error');
        return true;
    }
    
    let hasErrors = false;
    
    for (const file of files) {
        const fullPath = path.join(dirPath, file);
        
        try {
            const success = processFile(fullPath);
            if (!success) {
                hasErrors = true;
                break;
            }
        } catch (error) {
            logToConsole(`Error reading ${file}: ${error.message}`, true);
            hasErrors = true;
            break;
        }
    }
    
    return !hasErrors;
}

/**
 * Logs messages to the console with color coding.
 *
 * @param {string} message
 * @param {string} type
 *
 * @returns {void}
 */
function logToConsole(message, type) {
    if (type === 'error') {
        // Red
        console.error(`\x1b[31m${message}\x1b[0m`);
    } else if (type === 'success') {
        // Green
        console.log(`\x1b[32m${message}\x1b[0m`);
    } else if (type === 'notice') {
        // Yellow
        console.log(`\x1b[33m${message}\x1b[0m`);
    } else if (type === 'verbose') {
        console.log(`[verbose]: ${message}`);
    } else {
        console.log(message);
    }
}

function main() {
    try {
        const filePath = getFilePath();
        const stats = fs.statSync(filePath);
        
        let success;

        if (stats.isDirectory()) {
            success = processDirectory(filePath);
        } else {
            success = processFile(filePath);
        }
        
        if (success) {
            logToConsole('✓ All checks passed.', 'success');
            process.exit(0);  // :)
        } else {
            logToConsole('✗ Some checks failed.', 'error');
            process.exit(1);  // :(
        }
    } catch (error) {
        logToConsole(`Error: ${error.message}`, 'error');
        process.exit(1);
    }
}

main();
