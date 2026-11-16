import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

/** Body validation against a shared contract schema: `@Body(new ZodPipe(createPostSchema))`. */
@Injectable()
export class ZodPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, metadata: ArgumentMetadata): T {
    if (metadata.type !== "body") return value as T;
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: result.error.issues
          .map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`)
          .join("; "),
      });
    }
    return result.data;
  }
}
