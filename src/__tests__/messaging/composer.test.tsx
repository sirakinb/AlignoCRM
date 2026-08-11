import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Composer } from "@/components/messaging/composer";
import type { ChannelAvailability } from "@/lib/data/conversations";

afterEach(() => cleanup());

const enabled: ChannelAvailability = {
  enabled: true,
  hasAddress: true,
  suppressed: null,
  disabledReason: null,
  warning: null,
};
const noPhone: ChannelAvailability = {
  enabled: false,
  hasAddress: false,
  suppressed: null,
  disabledReason: "No phone number on this contact.",
  warning: null,
};
const bounce: ChannelAvailability = {
  enabled: false,
  hasAddress: true,
  suppressed: "bounce",
  disabledReason: "This email address hard-bounced and is undeliverable.",
  warning: null,
};
const unsub: ChannelAvailability = {
  enabled: true,
  hasAddress: true,
  suppressed: "unsubscribe",
  disabledReason: null,
  warning: "This contact unsubscribed from marketing. A 1:1 reply is allowed.",
};

describe("Composer — channel capability (P3-14/P3-15)", () => {
  it("shows the subject field in email mode and hides it in SMS mode", () => {
    render(
      <Composer
        channels={{ email: enabled, sms: enabled }}
        sending={false}
        error={null}
        onSend={vi.fn()}
      />
    );
    // Defaults to email → subject visible.
    expect(screen.getByPlaceholderText("Subject")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /SMS/ }));
    expect(screen.queryByPlaceholderText("Subject")).not.toBeInTheDocument();
  });

  it("disables SMS with an explanation when the contact has no phone", () => {
    render(
      <Composer
        channels={{ email: enabled, sms: noPhone }}
        sending={false}
        error={null}
        onSend={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /SMS/ }));
    expect(screen.getByText("No phone number on this contact.")).toBeInTheDocument();
  });

  it("disables email on a bounce with a naming reason", () => {
    render(
      <Composer
        channels={{ email: bounce, sms: enabled }}
        sending={false}
        error={null}
        onSend={vi.fn()}
      />
    );
    // email is disabled → default falls to sms; click Email to reveal its reason.
    fireEvent.click(screen.getByRole("button", { name: /Email/ }));
    expect(
      screen.getByText("This email address hard-bounced and is undeliverable.")
    ).toBeInTheDocument();
  });

  it("keeps email enabled but warns on an unsubscribe", () => {
    render(
      <Composer
        channels={{ email: unsub, sms: noPhone }}
        sending={false}
        error={null}
        onSend={vi.fn()}
      />
    );
    expect(
      screen.getByText(/unsubscribed from marketing/)
    ).toBeInTheDocument();
    // Still sendable.
    fireEvent.change(screen.getByPlaceholderText(/Write a/), {
      target: { value: "Hi there" },
    });
    expect(screen.getByRole("button", { name: /Send/ })).not.toBeDisabled();
  });

  it("calls onSend with channel, subject, and body", () => {
    const onSend = vi.fn();
    render(
      <Composer
        channels={{ email: enabled, sms: enabled }}
        sending={false}
        error={null}
        onSend={onSend}
      />
    );
    fireEvent.change(screen.getByPlaceholderText("Subject"), {
      target: { value: "Hi" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Write a/), {
      target: { value: "Hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Send/ }));
    expect(onSend).toHaveBeenCalledWith("email", "Hi", "Hello");
  });

  it("retains the drafted text when the send fails (P5-09)", async () => {
    const onSend = vi.fn().mockResolvedValue(false); // send failed
    render(
      <Composer
        channels={{ email: enabled, sms: enabled }}
        sending={false}
        error="Message could not be sent."
        onSend={onSend}
      />
    );
    fireEvent.change(screen.getByPlaceholderText("Subject"), { target: { value: "Hi" } });
    const body = screen.getByPlaceholderText(/Write a/) as HTMLTextAreaElement;
    fireEvent.change(body, { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: /Send/ }));
    await Promise.resolve();
    // Draft is preserved so the user can retry.
    expect((screen.getByPlaceholderText(/Write a/) as HTMLTextAreaElement).value).toBe("Hello");
    expect((screen.getByPlaceholderText("Subject") as HTMLInputElement).value).toBe("Hi");
    // The inline error is shown.
    expect(screen.getByText("Message could not be sent.")).toBeInTheDocument();
  });

  it("clears the composer on a confirmed success (P5-09)", async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    render(
      <Composer
        channels={{ email: enabled, sms: enabled }}
        sending={false}
        error={null}
        onSend={onSend}
      />
    );
    fireEvent.change(screen.getByPlaceholderText("Subject"), { target: { value: "Hi" } });
    fireEvent.change(screen.getByPlaceholderText(/Write a/), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: /Send/ }));
    await Promise.resolve();
    await Promise.resolve();
    expect((screen.getByPlaceholderText(/Write a/) as HTMLTextAreaElement).value).toBe("");
    expect((screen.getByPlaceholderText("Subject") as HTMLInputElement).value).toBe("");
  });
});
