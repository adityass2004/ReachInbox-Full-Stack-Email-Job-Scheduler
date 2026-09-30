import { Client, estypes } from "@elastic/elasticsearch";

export interface EmailSearchDocument {
    emailJobId: string;
    userId: string;
    recipient: string;
    sender: string;
    subject: string;
    status: string;
    campaignId: string | null;
    scheduledAt: string;
    sentAt: string | null;
    rescheduledAt?: string | null;
    nextAttemptAt?: string | null;
    createdAt?: string;
}

export interface EmailSearchQuery {
    q: string;
    status?: string;
    statuses?: string[];
    page: number;
    limit: number;
}

export interface EmailSearchResult {
    items: EmailSearchDocument[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export class EmailSearchService {
    private client: Client | null = null;
    private indexCreation: Promise<boolean> | null = null;
    private readonly configuredIndexName?: string;

    constructor(options: { client?: Client; indexName?: string } = {}) {
        this.client = options.client ?? null;
        this.configuredIndexName = options.indexName;
    }

    private get indexName(): string {
        return this.configuredIndexName || process.env.ELASTICSEARCH_INDEX || "email-jobs";
    }

    private getClient(): Client {
        if (!this.client) {
            const node =
                process.env.ELASTICSEARCH_URL ||
                process.env.ELASTICSEARCH_NODE ||
                "http://localhost:9200";
            const apiKey = process.env.ELASTICSEARCH_API_KEY?.trim();
            const username = process.env.ELASTICSEARCH_USERNAME?.trim();
            const password = process.env.ELASTICSEARCH_PASSWORD?.trim();

            let auth: { apiKey: string } | { username: string; password: string } | undefined;
            if (apiKey) {
                auth = { apiKey };
            } else if (username && password) {
                auth = { username, password };
            }

            this.client = new Client({
                node,
                ...(auth ? { auth } : {}),
                requestTimeout: 3000,
                maxRetries: 1,
            });
        }
        return this.client;
    }

    private ensureIndex(): Promise<boolean> {
        if (!this.indexCreation) {
            this.indexCreation = this.createIndexIfMissing().finally(() => {
                this.indexCreation = null;
            });
        }
        return this.indexCreation;
    }

    private async createIndexIfMissing(): Promise<boolean> {
        try {
            const client = this.getClient();
            if (await client.indices.exists({ index: this.indexName })) return true;

            try {
                await client.indices.create({
                    index: this.indexName,
                    mappings: {
                        properties: {
                            emailJobId: { type: "keyword" },
                            userId: { type: "keyword" },
                            recipient: { type: "text", fields: { keyword: { type: "keyword" } } },
                            sender: { type: "text", fields: { keyword: { type: "keyword" } } },
                            subject: { type: "text", fields: { keyword: { type: "keyword" } } },
                            status: { type: "keyword" },
                            campaignId: { type: "keyword" },
                            scheduledAt: { type: "date" },
                            sentAt: { type: "date" },
                        },
                    },
                });
                return true;
            } catch {
                return await client.indices.exists({ index: this.indexName });
            }
        } catch {
            console.warn("[Elasticsearch] Index is unavailable; email operation will continue.");
            return false;
        }
    }

    async indexEmailJobs(documents: EmailSearchDocument[]): Promise<boolean> {
        if (documents.length === 0 || !(await this.ensureIndex())) return false;

        try {
            const operations: estypes.BulkOperationContainer[] = [];
            for (const document of documents) {
                operations.push({ index: { _index: this.indexName, _id: document.emailJobId } });
                operations.push(document as unknown as estypes.BulkOperationContainer);
            }

            const result = await this.getClient().bulk({ operations, refresh: false });
            if (result.errors) {
                console.warn("[Elasticsearch] Some email documents could not be indexed.");
            }
            return !result.errors;
        } catch {
            console.warn("[Elasticsearch] Email indexing failed; PostgreSQL remains authoritative.");
            return false;
        }
    }

    async searchEmailJobs(
        userId: string,
        query: EmailSearchQuery,
    ): Promise<EmailSearchResult | null> {
        if (!(await this.ensureIndex())) return null;

        try {
            const filters: estypes.QueryDslQueryContainer[] = [
                { term: { userId } },
            ];
            if (query.status) filters.push({ term: { status: query.status } });
            else if (query.statuses?.length) filters.push({ terms: { status: query.statuses } });

            const response = await this.getClient().search<EmailSearchDocument>({
                index: this.indexName,
                from: (query.page - 1) * query.limit,
                size: query.limit,
                sort: [{ scheduledAt: { order: "desc" } }],
                query: {
                    bool: {
                        filter: filters,
                        must: query.q
                            ? [
                                {
                                    multi_match: {
                                        query: query.q,
                                        fields: ["recipient", "subject"],
                                        type: "best_fields",
                                    },
                                },
                            ]
                            : [{ match_all: {} }],
                    },
                },
            });

            const total =
                typeof response.hits.total === "number"
                    ? response.hits.total
                    : response.hits.total?.value ?? 0;
            const items = response.hits.hits.flatMap((hit) =>
                hit._source ? [hit._source] : [],
            );

            return {
                items,
                total,
                page: query.page,
                limit: query.limit,
                totalPages: Math.ceil(total / query.limit),
            };
        } catch {
            console.warn("[Elasticsearch] Search failed; returning unavailable status.");
            return null;
        }
    }

    async close(): Promise<void> {
        if (this.client) {
            const client = this.client;
            this.client = null;
            try {
                await client.close();
            } catch {
                console.warn("[Elasticsearch] Client shutdown was incomplete.");
            }
        }
    }
}

export const emailSearchService = new EmailSearchService();