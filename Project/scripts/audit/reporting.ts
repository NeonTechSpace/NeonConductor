import type {
    AgentsConformanceReport,
    AuditCategoryReport,
    AuditSummary,
    AuditWorklistOptions,
    ReviewedAuditViolation,
} from '@/scripts/audit/types';

function sumViolations(categories: AuditCategoryReport[], lane: AuditCategoryReport['lane']): number {
    return categories
        .filter((category) => category.lane === lane)
        .reduce((total, category) => total + category.violations.length, 0);
}

function isReviewViolationUnresolved(violation: ReviewedAuditViolation): boolean {
    return (
        violation.reviewStatus === undefined ||
        violation.reviewStatus === 'new' ||
        violation.reviewStatus === 'stale' ||
        violation.reviewStatus === 'needs-refactor'
    );
}

function filterViolations(category: AuditCategoryReport, options: AuditWorklistOptions): ReviewedAuditViolation[] {
    let violations = category.violations;

    if (options.newOnly) {
        violations = violations.filter((violation) => violation.reviewStatus === 'new');
    }

    if (options.staleOnly) {
        violations = violations.filter((violation) => violation.reviewStatus === 'stale');
    }

    if (
        !options.includeReviewed &&
        (category.lane === 'manual-review' || category.lane === 'actionable-review') &&
        !options.newOnly &&
        !options.staleOnly
    ) {
        violations = violations.filter((violation) => isReviewViolationUnresolved(violation));
    }

    return violations;
}

export function filterAuditCategories(
    categories: AuditCategoryReport[],
    options: AuditWorklistOptions = {}
): AuditCategoryReport[] {
    return categories
        .filter((category) => (options.lane ? category.lane === options.lane : true))
        .filter((category) => (options.category ? category.key === options.category : true))
        .map((category) => ({
            ...category,
            violations: filterViolations(category, options),
        }))
        .filter((category) => category.violations.length > 0);
}

export function buildAuditSummary(categories: AuditCategoryReport[]): AuditSummary {
    const blockingCount = sumViolations(categories, 'blocking');
    const actionableReviewCount = sumViolations(categories, 'actionable-review');
    const manualReviewViolations = categories
        .filter((category) => category.lane === 'manual-review')
        .flatMap((category) => category.violations);
    const actionableReviewViolations = categories
        .filter((category) => category.lane === 'actionable-review')
        .flatMap((category) => category.violations);

    const reviewedCleanCount = manualReviewViolations.filter(
        (violation) => violation.reviewStatus === 'reviewed-clean'
    ).length;
    const acceptedRiskCount = manualReviewViolations.filter(
        (violation) => violation.reviewStatus === 'accepted-risk'
    ).length;
    const staleReviewCount = manualReviewViolations.filter((violation) => violation.reviewStatus === 'stale').length;
    const manualReviewOutstandingCount = manualReviewViolations.filter((violation) =>
        isReviewViolationUnresolved(violation)
    ).length;
    const unresolvedActionableCount = actionableReviewViolations.filter((violation) =>
        isReviewViolationUnresolved(violation)
    ).length;
    const unresolvedManualCount = manualReviewOutstandingCount;

    let overallStatus: AuditSummary['overallStatus'] = 'clean';
    if (blockingCount > 0) {
        overallStatus = 'blocking-violations-present';
    } else if (manualReviewOutstandingCount > 0 || unresolvedActionableCount > 0) {
        overallStatus = 'manual-review-outstanding';
    } else if (acceptedRiskCount > 0) {
        overallStatus = 'clean-except-accepted-risk';
    }

    return {
        blockingCount,
        actionableReviewCount,
        manualReviewCount: manualReviewViolations.length,
        unresolvedActionableCount,
        unresolvedManualCount,
        reviewedCleanCount,
        acceptedRiskCount,
        staleReviewCount,
        manualReviewOutstandingCount,
        overallStatus,
    };
}

export function formatAuditWorklist(report: AgentsConformanceReport, options: AuditWorklistOptions = {}): string {
    const categories = filterAuditCategories(report.categories, options);

    const sections = categories.map((category) => {
        const header = `## ${category.label} [${category.lane}]`;
        const items = category.violations
            .map((violation) => {
                const statusSuffix = violation.reviewStatus ? ` (${violation.reviewStatus})` : '';
                return `- ${violation.path}:${String(violation.line)}${statusSuffix} - ${violation.message}`;
            })
            .join('\n');

        return `${header}\n${items}`;
    });

    const filterNotes: string[] = [];
    if (options.lane) {
        filterNotes.push(`lane=${options.lane}`);
    }
    if (options.category) {
        filterNotes.push(`category=${options.category}`);
    }
    if (options.newOnly) {
        filterNotes.push('new-only');
    }
    if (options.staleOnly) {
        filterNotes.push('stale-only');
    }
    if (options.includeReviewed) {
        filterNotes.push('include-reviewed');
    }

    return [
        'AGENTS audit worklist',
        `status: ${report.summary.overallStatus}`,
        `blocking: ${String(report.summary.blockingCount)}`,
        `unresolved-actionable: ${String(report.summary.unresolvedActionableCount)}`,
        `unresolved-manual: ${String(report.summary.unresolvedManualCount)}`,
        `reviewed-clean: ${String(report.summary.reviewedCleanCount)}`,
        `accepted-risk: ${String(report.summary.acceptedRiskCount)}`,
        `stale-reviewed: ${String(report.summary.staleReviewCount)}`,
        filterNotes.length > 0 ? `filters: ${filterNotes.join(', ')}` : 'filters: default-unresolved',
        '',
        ...sections,
    ].join('\n');
}

