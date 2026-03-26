import ts from 'typescript';

import { isRendererSourceFile, isTestFile } from '@/scripts/audit/sourceFiles';

import type { AuditSourceFile, AuditViolation } from '@/scripts/audit/types';

function getLineNumber(sourceFile: ts.SourceFile, node: ts.Node): number {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function pushUniqueViolation(target: AuditViolation[], nextViolation: AuditViolation): void {
    const alreadyExists = target.some(
        (violation) =>
            violation.path === nextViolation.path &&
            violation.line === nextViolation.line &&
            violation.message === nextViolation.message
    );
    if (!alreadyExists) {
        target.push(nextViolation);
    }
}

type NamedAsyncDeclaration = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;

function collectNamedAsyncDeclarations(sourceFile: ts.SourceFile): Map<string, NamedAsyncDeclaration> {
    const asyncDeclarations = new Map<string, NamedAsyncDeclaration>();

    function visit(node: ts.Node): void {
        if (
            ts.isFunctionDeclaration(node) &&
            node.name &&
            node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)
        ) {
            asyncDeclarations.set(node.name.text, node);
        }

        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
            if (
                (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) &&
                node.initializer.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)
            ) {
                asyncDeclarations.set(node.name.text, node.initializer);
            }
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return asyncDeclarations;
}

function getPropertyAccessName(callExpression: ts.CallExpression): string | undefined {
    if (ts.isPropertyAccessExpression(callExpression.expression)) {
        return callExpression.expression.name.text;
    }

    return undefined;
}

function isPromiseChainHandled(callExpression: ts.CallExpression): boolean {
    const propertyAccessName = getPropertyAccessName(callExpression);
    if (propertyAccessName === 'catch') {
        return true;
    }

    if (propertyAccessName === 'then' && callExpression.arguments.length >= 2) {
        return true;
    }

    if (propertyAccessName === 'finally' && ts.isPropertyAccessExpression(callExpression.expression)) {
        const chainRoot = callExpression.expression.expression;
        if (ts.isCallExpression(chainRoot)) {
            return isPromiseChainHandled(chainRoot);
        }
    }

    return false;
}

function containsMissingSentinel(node: ts.Node): boolean {
    if (ts.isStringLiteralLike(node)) {
        return node.text.endsWith('_missing');
    }

    if (ts.isIdentifier(node)) {
        return node.text.includes('MISSING') || node.text.endsWith('MissingId');
    }

    let foundMissingSentinel = false;
    ts.forEachChild(node, (childNode) => {
        if (!foundMissingSentinel && containsMissingSentinel(childNode)) {
            foundMissingSentinel = true;
        }
    });

    return foundMissingSentinel;
}

function containsCallSiteCast(node: ts.Node): boolean {
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
        return true;
    }

    let foundCallSiteCast = false;
    ts.forEachChild(node, (childNode) => {
        if (!foundCallSiteCast && containsCallSiteCast(childNode)) {
            foundCallSiteCast = true;
        }
    });

    return foundCallSiteCast;
}

function isQueryLikeCall(callExpression: ts.CallExpression): boolean {
    const propertyAccessName = getPropertyAccessName(callExpression);
    if (!propertyAccessName) {
        return false;
    }

    return (
        propertyAccessName === 'useQuery' ||
        propertyAccessName === 'useInfiniteQuery' ||
        propertyAccessName === 'prefetch' ||
        propertyAccessName === 'prefetchQuery' ||
        propertyAccessName === 'ensureQueryData'
    );
}

function isBoundaryCall(callExpression: ts.CallExpression): boolean {
    const propertyAccessName = getPropertyAccessName(callExpression);
    if (!propertyAccessName) {
        return false;
    }

    return new Set([
        'useQuery',
        'useInfiniteQuery',
        'prefetch',
        'prefetchQuery',
        'ensureQueryData',
        'mutate',
        'mutateAsync',
        'invalidate',
        'invalidateQueries',
        'refetch',
    ]).has(propertyAccessName);
}

function isKnownRiskyCall(callExpression: ts.CallExpression): boolean {
    const propertyAccessName = getPropertyAccessName(callExpression);
    if (propertyAccessName === 'mutateAsync' || propertyAccessName === 'refetch') {
        return true;
    }

    if (
        ts.isPropertyAccessExpression(callExpression.expression) &&
        callExpression.expression.getText() === 'navigator.clipboard.writeText'
    ) {
        return true;
    }

    return false;
}

function functionBodyCanRejectOutward(
    declaration: NamedAsyncDeclaration,
    asyncDeclarations: Map<string, NamedAsyncDeclaration>,
    seenDeclarations: Set<string>
): boolean {
    const declarationName =
        ts.isFunctionDeclaration(declaration) && declaration.name
            ? declaration.name.text
            : ts.isVariableDeclaration(declaration.parent) &&
                ts.isIdentifier(declaration.parent.name)
              ? declaration.parent.name.text
              : undefined;

    if (declarationName && seenDeclarations.has(declarationName)) {
        return false;
    }

    const nextSeenDeclarations = new Set(seenDeclarations);
    if (declarationName) {
        nextSeenDeclarations.add(declarationName);
    }

    if (!declaration.body || !ts.isBlock(declaration.body)) {
        return true;
    }

    function nodeCanRejectOutward(node: ts.Node, protectedByCatch: boolean): boolean {
        if (ts.isTryStatement(node) && node.catchClause) {
            if (nodeCanRejectOutward(node.tryBlock, true)) {
                return true;
            }

            if (node.finallyBlock && nodeCanRejectOutward(node.finallyBlock, protectedByCatch)) {
                return true;
            }

            return false;
        }

        if (
            (ts.isAwaitExpression(node) || ts.isReturnStatement(node) || ts.isExpressionStatement(node)) &&
            protectedByCatch
        ) {
            let childCanReject = false;
            ts.forEachChild(node, (childNode) => {
                if (!childCanReject && nodeCanRejectOutward(childNode, true)) {
                    childCanReject = true;
                }
            });
            return childCanReject;
        }

        if (ts.isCallExpression(node)) {
            if (isKnownRiskyCall(node)) {
                return !protectedByCatch;
            }

            if (getPropertyAccessName(node) === 'then' && !isPromiseChainHandled(node)) {
                return !protectedByCatch;
            }

            if (ts.isIdentifier(node.expression)) {
                const localAsyncDeclaration = asyncDeclarations.get(node.expression.text);
                if (localAsyncDeclaration) {
                    return functionBodyCanRejectOutward(localAsyncDeclaration, asyncDeclarations, nextSeenDeclarations);
                }
            }
        }

        let childCanReject = false;
        ts.forEachChild(node, (childNode) => {
            if (!childCanReject && nodeCanRejectOutward(childNode, protectedByCatch)) {
                childCanReject = true;
            }
        });

        return childCanReject;
    }

    return nodeCanRejectOutward(declaration.body, false);
}

export function collectAsyncOwnershipViolations(files: AuditSourceFile[]): AuditViolation[] {
    const violations: AuditViolation[] = [];

    for (const file of files) {
        if (isTestFile(file.relativePath) || !isRendererSourceFile(file.relativePath)) {
            continue;
        }

        const sourceFile = ts.createSourceFile(
            file.relativePath,
            file.content,
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TSX
        );
        const asyncDeclarations = collectNamedAsyncDeclarations(sourceFile);

        function visit(node: ts.Node): void {
            if (ts.isVoidExpression(node) && ts.isCallExpression(node.expression)) {
                const callExpression = node.expression;
                const propertyAccessName = getPropertyAccessName(callExpression);

                const discardsAsyncMutation = propertyAccessName === 'mutateAsync' || propertyAccessName === 'refetch';
                const discardsUnhandledThen = propertyAccessName === 'then' && !isPromiseChainHandled(callExpression);
                const discardsRejectingLocalAsyncCall =
                    ts.isIdentifier(callExpression.expression) &&
                    (() => {
                        const localAsyncDeclaration = asyncDeclarations.get(callExpression.expression.text);
                        if (!localAsyncDeclaration) {
                            return false;
                        }

                        return functionBodyCanRejectOutward(localAsyncDeclaration, asyncDeclarations, new Set());
                    })();

                if (discardsAsyncMutation || discardsUnhandledThen || discardsRejectingLocalAsyncCall) {
                    pushUniqueViolation(violations, {
                        path: file.relativePath,
                        line: getLineNumber(sourceFile, node),
                        message:
                            'Review discarded async action and own the rejection path with await/catch or a fail-closed helper.',
                    });
                }
            }

            ts.forEachChild(node, visit);
        }

        visit(sourceFile);
    }

    return violations;
}

export function collectPlaceholderQueryInputViolations(files: AuditSourceFile[]): AuditViolation[] {
    const violations: AuditViolation[] = [];

    for (const file of files) {
        if (isTestFile(file.relativePath) || !isRendererSourceFile(file.relativePath)) {
            continue;
        }

        const sourceFile = ts.createSourceFile(
            file.relativePath,
            file.content,
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TSX
        );

        function visit(node: ts.Node): void {
            if (
                ts.isCallExpression(node) &&
                isQueryLikeCall(node) &&
                node.arguments.some((argument) => containsMissingSentinel(argument))
            ) {
                pushUniqueViolation(violations, {
                    path: file.relativePath,
                    line: getLineNumber(sourceFile, node),
                    message:
                        'Review placeholder query input and replace fake sentinel IDs with skipToken or mounted-only query ownership.',
                });
            }

            ts.forEachChild(node, visit);
        }

        visit(sourceFile);
    }

    return violations;
}

export function collectCallSiteCastViolations(files: AuditSourceFile[]): AuditViolation[] {
    const violations: AuditViolation[] = [];

    for (const file of files) {
        if (isTestFile(file.relativePath) || !isRendererSourceFile(file.relativePath)) {
            continue;
        }

        const sourceFile = ts.createSourceFile(
            file.relativePath,
            file.content,
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TSX
        );

        function visit(node: ts.Node): void {
            if (
                ts.isCallExpression(node) &&
                isBoundaryCall(node) &&
                node.arguments.some((argument) => containsCallSiteCast(argument))
            ) {
                pushUniqueViolation(violations, {
                    path: file.relativePath,
                    line: getLineNumber(sourceFile, node),
                    message:
                        'Review call-site cast at a query or mutation boundary and replace it with validated narrowing before the call.',
                });
            }

            ts.forEachChild(node, visit);
        }

        visit(sourceFile);
    }

    return violations;
}

