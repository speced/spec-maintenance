import '@components/sm-issue';
import { RepoJson } from '@lib/published-json';
import { cmpByTimeUsed } from '@lib/slo';
import { Task } from '@lit/task';
import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

const validCategories = [
    'triage',
    'urgent',
    'soon',
    'agenda',
    'needsEdits',
    'other',
] as const;

type Category = (typeof validCategories)[number];

function includes<T>(arr: readonly T[], value: any): value is T {
    return arr.includes(value);
}

@customElement('sm-issues-by-category')
export class IssuesByCategory extends LitElement {
    @property({
        type: String,
        converter: (value) => {
            if (includes(validCategories, value)) {
                return value;
            }
            return null;
        }
    })
    category: Category | null = null;

    @property({ attribute: false })
    allIssues: Promise<RepoJson>[] | null = null;

    private _myIssues = new Task(this, {
        args: () => [this.allIssues, this.category] as const,
        task: async ([allIssuesPromises, category], { signal }) => {
            if (!allIssuesPromises || !category) return null;
            const allIssues = await Promise.all(allIssuesPromises);
            signal.throwIfAborted();
            const flatIssues = allIssues.flatMap(repoIssues => repoIssues[category].map(issue => Object.assign(issue, { repo: repoIssues.repo })));
            flatIssues.sort(cmpByTimeUsed);
            return flatIssues;
        }
    });

    static styles = css`
    :host { display:block; }

    .allWithinSlo { display: var(--within-slo-display, block); }

    summary>h2 { display: inline-block; }

    h2>.sloViolations { display: var(--only-out-of-slo-display, inline); }
    h2>.all { display: var(--within-slo-display, inline); }
    [withinslo] { display: var(--within-slo-display, inline); }
    `;

    outsideSloMsg(): string {
        switch (this.category) {
            case null: return '';
            case "other": return '';
            case "soon": return 'soon-priority issues outside their SLO';
            case "triage": return 'untriaged issues outside their SLO';
            case "needsEdits": return 'issues with out-of-SLO pending edits';
            case "agenda": return 'issues that have been on the agenda too long';
            case "urgent": return 'urgent issues outside their SLO';
        }
    }

    allIssuesMsg(): string {
        switch (this.category) {
            case null: return '';
            case "other": return 'other issues';
            case "soon": return 'soon-priority issues';
            case "triage": return 'untriaged issues';
            case "needsEdits": return 'issues with pending edits';
            case "agenda": return 'issues on the agenda';
            case "urgent": return 'urgent issues';
        }
    }

    render() {
        if (this.category === null) return html``;
        return this._myIssues.render({
            complete: (issues) => {
                if (issues === null || issues.length === 0) return html``;

                const outOfSloIssues = issues.filter(({ outOfSlo }) => outOfSlo);

                return html`<details open class="${classMap({ allWithinSlo: outOfSloIssues.length === 0 })}">
                    <summary><h2>
                        <span class="sloViolations">${outOfSloIssues.length} ${this.outsideSloMsg()}</span>
                        <span class="all">${issues.length} ${this.allIssuesMsg()}</span>
                    </h2></summary>
                    <ul>
                        ${issues.map(issue => html`<li><sm-issue
                            href="${issue.url}"
                            repo="${issue.repo}"
                            sloType="${this.category}"
                            .sloTimeUsed="${issue.sloTimeUsed}"
                            .onAgendaFor="${issue.onAgendaFor}"
                            .neededEditsFor="${issue.neededEditsFor}">${issue.title}</sm-issue></li>`)}
                    </ul>
                </details>`;
            }
        });
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "sm-issues-by-category": IssuesByCategory;
    }
}
