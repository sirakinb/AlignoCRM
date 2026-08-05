import { describe, it, expect, vi, beforeEach } from "vitest";

let fromCallResults: Array<{ data: unknown; error: unknown }> = [];
let fromCallIndex = 0;

function makeChain() {
  const idx = fromCallIndex++;
  const self: Record<string, ReturnType<typeof vi.fn>> = {};
  const chainMethod = () => self;
  self.select = vi.fn(chainMethod);
  self.insert = vi.fn(chainMethod);
  self.update = vi.fn(chainMethod);
  self.delete = vi.fn(chainMethod);
  self.eq = vi.fn(chainMethod);
  self.order = vi.fn(chainMethod);
  self.limit = vi.fn(chainMethod);
  self.single = vi.fn(() => {
    const result = fromCallResults[idx];
    return Promise.resolve(result ?? { data: null, error: null });
  });
  (self as Record<string, unknown>).then = (
    resolve: (v: unknown) => void,
    reject: (v: unknown) => void
  ) => {
    const result = fromCallResults[idx];
    const val = result ?? { data: null, error: null };
    if (val.error) return reject(val.error);
    return resolve(val);
  };
  return self;
}

const mockFrom = vi.fn((_table: string) => makeChain());

vi.mock("@/lib/insforge/server", () => ({
  insforge: {
    database: {
      from: (table: string) => mockFrom(table),
    },
  },
}));

import {
  getEnrollments,
  getEnrollment,
  createEnrollment,
  updateEnrollment,
  getExecutionSteps,
  createExecutionStep,
} from "@/lib/data/enrollments";
import { EnrollmentStatus, StepOutcome } from "@/types/enrollment";

describe("enrollments data access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallResults = [];
    fromCallIndex = 0;
  });

  describe("getEnrollments", () => {
    it("fetches enrollments by workspace", async () => {
      const enrollments = [
        { id: "enr-1", workspace_id: "ws-1", status: "active" },
      ];
      fromCallResults[0] = { data: enrollments, error: null };

      const result = await getEnrollments("ws-1");

      expect(mockFrom).toHaveBeenCalledWith("workflow_enrollments");
      expect(result).toEqual(enrollments);
    });

    it("applies optional filters", async () => {
      fromCallResults[0] = { data: [], error: null };

      const result = await getEnrollments("ws-1", {
        workflow_id: "wf-1",
        status: EnrollmentStatus.Active,
        record_id: "c-1",
      });

      expect(mockFrom).toHaveBeenCalledWith("workflow_enrollments");
      expect(result).toEqual([]);
    });

    it("throws on error", async () => {
      fromCallResults[0] = {
        data: null,
        error: { message: "DB error" },
      };

      await expect(getEnrollments("ws-1")).rejects.toEqual(
        expect.objectContaining({ message: "DB error" })
      );
    });
  });

  describe("getEnrollment", () => {
    it("fetches a single enrollment by id", async () => {
      const enrollment = { id: "enr-1", status: "active" };
      fromCallResults[0] = { data: enrollment, error: null };

      const result = await getEnrollment("enr-1");

      expect(mockFrom).toHaveBeenCalledWith("workflow_enrollments");
      expect(result).toEqual(enrollment);
    });

    it("throws when not found", async () => {
      fromCallResults[0] = {
        data: null,
        error: { code: "PGRST116", message: "not found" },
      };

      await expect(getEnrollment("enr-missing")).rejects.toEqual(
        expect.objectContaining({ code: "PGRST116" })
      );
    });
  });

  describe("createEnrollment", () => {
    it("creates an enrollment with active status", async () => {
      const enrollment = {
        id: "enr-1",
        workspace_id: "ws-1",
        workflow_id: "wf-1",
        status: "active",
      };
      fromCallResults[0] = { data: enrollment, error: null };

      const result = await createEnrollment({
        workspace_id: "ws-1",
        workflow_id: "wf-1",
        workflow_version_id: "ver-1",
        record_id: "c-1",
        record_type: "contact",
      });

      expect(mockFrom).toHaveBeenCalledWith("workflow_enrollments");
      expect(result).toEqual(enrollment);
    });
  });

  describe("updateEnrollment", () => {
    it("updates enrollment fields", async () => {
      const updated = { id: "enr-1", status: "completed" };
      fromCallResults[0] = { data: updated, error: null };

      const result = await updateEnrollment("enr-1", {
        status: EnrollmentStatus.Completed,
        completed_at: "2026-01-02T00:00:00Z",
      });

      expect(mockFrom).toHaveBeenCalledWith("workflow_enrollments");
      expect(result).toEqual(updated);
    });
  });

  describe("getExecutionSteps", () => {
    it("fetches steps for an enrollment ordered by started_at", async () => {
      const steps = [
        { id: "step-1", enrollment_id: "enr-1", outcome: "completed" },
      ];
      fromCallResults[0] = { data: steps, error: null };

      const result = await getExecutionSteps("enr-1");

      expect(mockFrom).toHaveBeenCalledWith("execution_steps");
      expect(result).toEqual(steps);
    });
  });

  describe("createExecutionStep", () => {
    it("creates an execution step record", async () => {
      const step = {
        id: "step-1",
        enrollment_id: "enr-1",
        node_id: "node-1",
        node_type: "send_email",
        outcome: "completed",
      };
      fromCallResults[0] = { data: step, error: null };

      const result = await createExecutionStep({
        enrollment_id: "enr-1",
        node_id: "node-1",
        node_type: "send_email",
        outcome: StepOutcome.Completed,
        completed_at: "2026-01-01T00:00:01Z",
      });

      expect(mockFrom).toHaveBeenCalledWith("execution_steps");
      expect(result).toEqual(step);
    });
  });
});
