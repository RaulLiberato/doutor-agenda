"use server";

import dayjs from "dayjs";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { db } from "@/db";
import { appointmentsTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import { actionClient } from "@/lib/next-safe-action";

import { upsertAppointmentSchema } from "./schema";
import { getAvailableTimes } from "../get-available-times";

export const upsertAppointment = actionClient
  .schema(upsertAppointmentSchema)
  .action(async ({ parsedInput }) => {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session?.user) {
      throw new Error("Unauthorized");
    }
    if (!session?.user.clinic?.id) {
      throw new Error("Clinic not found");
    }
    const availableTimes = await getAvailableTimes({
      doctorId: parsedInput.doctorId,
      date: dayjs(parsedInput.date).format("YYYY-MM-DD"),
    });
    if (!availableTimes?.data) {
      throw new Error("Not available times");
    }
    const isTimeAvailable = availableTimes.data?.some(
      (time) => time.value === parsedInput.time,
    );
    if (!isTimeAvailable) {
      throw new Error("Time not available");
    }

    const appointmentDateTime = dayjs(parsedInput.date)
      .set("hour", parseInt(parsedInput.time.split(":")[0]))
      .set("minute", parseInt(parsedInput.time.split(":")[1]))
      .toDate();

    await db
      .insert(appointmentsTable)
      .values({
        ...parsedInput,
        id: parsedInput.id,
        clinicId: session?.user.clinic?.id,
        date: appointmentDateTime,
      })
      .onConflictDoUpdate({
        target: [appointmentsTable.id],
        set: {
          ...parsedInput,
          date: appointmentDateTime,
        },
      });
    revalidatePath("/appointments");
  });
