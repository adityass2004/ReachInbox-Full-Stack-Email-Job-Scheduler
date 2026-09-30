import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@elastic/elasticsearch";
import {
    EmailSearchDocument,
    EmailSearchService,
} from "../src/search/email-search.js";

const document: EmailSearchDocument = {
    emailJobId: "job-1",
    userId: "owner-1",
    recipient: "recipient@example.com",
    sender: "sender@example.com",
    subject: "Welcome",
    status: "SENT",
    campaignId: "campaign-1",
    scheduledAt: "2026-09-30T10:00:00.000Z",
    sentAt: "2026-09-30T10:01:00.000Z",
};

describe("Elasticsearch email search service", () => {
    it("creates the mapping, bulk-indexes documents, and filters search by owner", async () => {
        let mapping: unknown;
        let operations: unknown[] = [];
        let searchRequest: Record<string, unknown> | undefined;
        const client = {
            indices: {
                async exists() {
                    return false;
                },
                async create(request: unknown) {
                    mapping = request;
                },
            },
            async bulk(request: { operations: unknown[] }) {
                operations = request.operations;
                return { errors: false };
            },
            async search(request: Record<string, unknown>) {
                searchRequest = request;
                return { hits: { total: { value: 1 }, hits: [{ _source: document }] } };
            },
            async close() { },
        } as unknown as Client;

        const service = new EmailSearchService({ client, indexName: "test-email-jobs" });
        assert.strictEqual(await service.indexEmailJobs([document]), true);
        assert.strictEqual(operations.length, 2);
        assert.deepStrictEqual(mapping, {
            index: "test-email-jobs",
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

        const result = await service.searchEmailJobs("owner-1", {
            q: "Welcome",
            status: "SENT",
            page: 2,
            limit: 10,
        });
        assert.strictEqual(result?.total, 1);
        assert.strictEqual(result?.items[0].emailJobId, "job-1");
        assert.strictEqual(searchRequest?.from, 10);
        assert.deepStrictEqual(
            (searchRequest?.query as { bool: { filter: unknown[] } }).bool.filter,
            [{ term: { userId: "owner-1" } }, { term: { status: "SENT" } }],
        );

        await service.searchEmailJobs("owner-1", {
            q: "",
            statuses: ["SENT", "FAILED"],
            page: 1,
            limit: 20,
        });
        assert.deepStrictEqual(
            (searchRequest?.query as { bool: { filter: unknown[] } }).bool.filter,
            [{ term: { userId: "owner-1" } }, { terms: { status: ["SENT", "FAILED"] } }],
        );
    });

    it("returns unavailable without throwing when Elasticsearch is unreachable", async () => {
        const client = {
            indices: {
                async exists() {
                    throw new Error("Connection refused");
                },
            },
            async close() { },
        } as unknown as Client;
        const service = new EmailSearchService({ client });

        assert.strictEqual(await service.indexEmailJobs([document]), false);
        assert.strictEqual(
            await service.searchEmailJobs("owner-1", { q: "", page: 1, limit: 20 }),
            null,
        );
    });
});