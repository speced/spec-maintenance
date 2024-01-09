import { Temporal } from "@js-temporal/polyfill";
import { formatRoundAge } from "@lib/formatRoundAge";
import { SloType } from "@lib/repo-summaries";
import { slo, sloMap } from "@lib/slo";
import { LitElement, css, html, nothing, type ComplexAttributeConverter, type PropertyValues } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { ZodEnum } from "zod";

function enumPropertyConverter<Vs extends [string, ...string[]]>(values: ZodEnum<Vs>) {
    return {
        fromAttribute(value: string) {
            const parse = values.safeParse(value);
            if (parse.success) return parse.data;
            return null;
        },
        toAttribute(value: string) { return value; },
    };
}

const durationPropertyConverter: ComplexAttributeConverter<Temporal.Duration | null> = {
    fromAttribute(value) {
        if (!value) return null;
        return Temporal.Duration.from(value);
    },
    toAttribute(value) { return value; },
}

@customElement('sm-issue')
export class Issue extends LitElement {
    static styles = css`
    .error {
        color: red;
    }
    .warning {
        color: orange;
    }`;

    @property({ type: String })
    href: string | null = null;

    @property({ type: String })
    repo: string | null = null;

    @property({ converter: enumPropertyConverter(SloType) })
    sloType: SloType | undefined = undefined;

    @property({ converter: durationPropertyConverter, reflect: true })
    sloTimeUsed: Temporal.Duration | null = null;

    @property({ type: Boolean, reflect: true })
    withinSlo: boolean = true;

    willUpdate(changedProperties: PropertyValues<this>) {
        if (changedProperties.has('sloType') || changedProperties.has('sloTimeUsed')) {
            this.withinSlo = true;
            if (this.sloType && this.sloTimeUsed) {
                const { withinSlo } = slo({ whichSlo: this.sloType, sloTimeUsed: this.sloTimeUsed });
                this.withinSlo = withinSlo;
            }
        }
    }

    render() {
        let timeToReport = this.sloTimeUsed;
        if (this.sloType && this.sloTimeUsed && !this.withinSlo) {
            timeToReport = this.sloType === "none" ? null : this.sloTimeUsed.subtract(sloMap[this.sloType]);
        }

        return html`${this.repo ? `${this.repo}: ` : nothing}<a href="${this.href ?? nothing}"><slot>&lt;No title></slot></a>:
            ${this.withinSlo ? "on maintainers' plate" : html`<span class="error">out of SLO</span>`}
            ${timeToReport ? html`for <time datetime="${timeToReport.toString()}">${formatRoundAge(timeToReport)}</time>` : nothing}
        `;
    }
}


declare global {
    interface HTMLElementTagNameMap {
        "sm-issue": Issue;
    }
}
