import {Command, UsageError} from 'clipanion';
import path                  from 'path';
import tar                   from 'tar';

import * as folderUtils      from '../folderUtils';
import {Context}             from '../main';
import * as specUtils        from '../specUtils';
import {Descriptor}          from '../types';

export class PrepareCommand extends Command<Context> {
  static usage = Command.Usage({
    description: `Generate a package manager archive`,
    details: `
      This command makes sure that the specified package managers are installed in the local cache. Calling this command explicitly unless you operate in an environment without network access (in which case you'd have to call \`prepare\` while building your image, to make sure all tools are available for later use).

      When the \`-o,--output\` flag is set, Corepack will also compress the resulting package manager into a format suitable for \`corepack hydrate\`, and will store it at the specified location on the disk.
    `,
    examples: [[
      `Prepare the package manager from the active project`,
      `$0 prepare`,
    ], [
      `Prepare a specific Yarn version`,
      `$0 prepare yarn@2.2.2`,
    ], [
      `Generate an archive for a specific Yarn version`,
      `$0 prepare yarn@2.2.2 -o`,
    ], [
      `Generate a named archive`,
      `$0 prepare yarn@2.2.2 --output=yarn.tgz`,
    ]],
  });

  @Command.String({required: false})
  spec?: string;

  @Command.Boolean(`--activate`)
  activate: boolean = false;

  @Command.Boolean(`--all`)
  all: boolean = false;

  @Command.String(`-o,--output`, {tolerateBoolean: true})
  output?: string | boolean;

  @Command.Boolean(`--json`)
  json: boolean = false;

  @Command.Path(`prepare`)
  async execute() {
    if (this.all && typeof this.spec !== `undefined`)
      throw new UsageError(`The --all option cannot be used along with an explicit package manager specification`);

    const specs = this.all
      ? await this.context.engine.getDefaultDescriptors()
      : [this.spec];

    for (const request of specs) {
      let spec: Descriptor;

      if (typeof request === `undefined`) {
        const lookup = await specUtils.loadSpec(this.context.cwd);
        switch (lookup.type) {
          case `NoProject`:
            throw new UsageError(`Couldn't find a project in the local directory - please explicit the package manager to pack, or run this command from a valid project`);

          case `NoSpec`:
            throw new UsageError(`The local project doesn't feature a 'packageManager' field - please explicit the package manager to pack, or update the manifest to reference it`);

          default: {
            spec = lookup.spec;
          }
        }
      } else {
        spec = typeof request === `string`
          ? specUtils.parseSpec(request, `CLI arguments`)
          : request;
      }

      const resolved = await this.context.engine.resolveDescriptor(spec);
      if (resolved === null)
        throw new UsageError(`Failed to successfully resolve '${spec.range}' to a valid ${spec.name} release`);

      const baseInstallFolder = folderUtils.getInstallFolder();
      const installSpec = await this.context.engine.ensurePackageManager(resolved);

      if (this.activate)
        await this.context.engine.activatePackageManager(resolved);

      if (!this.output)
        continue;

      const fileName = typeof this.output === `string`
        ? this.output
        : typeof request !== `undefined`
          ? path.join(this.context.cwd, `corepack-${resolved.name}-${resolved.reference}.tgz`)
          : path.join(this.context.cwd, `corepack-${resolved.name}.tgz`);

      await tar.c({gzip: true, cwd: baseInstallFolder, file: fileName}, [path.relative(baseInstallFolder, installSpec.location)]);

      if (this.json) {
        this.context.stdout.write(`${JSON.stringify(fileName)}\n`);
      } else {
        this.context.stdout.write(`Packed ${fileName}\n`);
      }
    }
  }
}
