**Dolphin** is an innovative, automated internationalization (i18n) service designed to integrate seamlessly into your development pipeline.

<!--ts-->

- [Usage](#Usage)
- [Configuration](#Configuration)
- [Troubleshooting](#Troubleshooting)

<!--te-->

## Usage

Dolphin requires a configuration file to desribe the translation strings and preferred options.

Here's an example of a configuration file:

```yaml
baseLanguage: en
translator:
  agent: api
  baseUrl: http://localhost:3000/v1/
  mode: interactive
localizations:
  - id: hostapp
    path: TranditionalXcodeDemo/${LANGUAGE}.lproj/Localizable.strings
    format: strings
    languages:
      - fr
      - ja
      - zh-Hans
```

It means that Dolphin will look for a file named `Localizable.strings` in the `TranditionalXcodeDemo/en.lproj` directory whose format is `Apple Localized Strings`. And then translate it to French, Japanese, and Simplified Chinese with `openai`.

For more details on how to write a configuration file, please check the [Configuration](#Configuration) section.

### Running Dolphin

By default, Dolphin looks for a file named `dolphin.yml` in the current working directory.

```shell
dolphin localize
```

You can specify a different file with the `--config` option.

```shell
dolphin localize --config path/to/dolphin.yml
```

An interactive shell like below will guide you through the translation process.

![Output Screenshot](assets/output-screenshot.jpg)

## Configuration

Configration file is a YAML file with the following structure:

```yaml
baseLanguage: [required, language code]

translator:
  agent: [required, translator name]
  mode: [required, translator mode]
  .... [extra config for the translator]

globalContext: [optional, custom translation context]

localizations:
  - id: [required, string, to identify the localization]
    path: [required, path to strings]
    format: [required, string format]
    languages:
      - [required, language code]
      - [required, language code]
      ...

  - id: [required, string, to identify the localization]
    path: [required, path to strings]
    format: [required, string format]
    languages:
      - [required, language code]
      - [required, language code]
      ...

  ...
```

Language codes can be any commonly used ones, such as `en-US`, `ja`, `es`, etc. As long as it is supported by the translator.

#### baseLanguage

The source language of the strings, which is used to translate from.

#### translator

Supported translators:

- **api**: Dolphin API. You need to provide the `baseUrl` to the API endpoint. An example of the API service can be found in the [api folder](https://github.com/icodesign/dolphin/tree/main/apps/api/).

Supported modes:

- **interactive**: In interactive mode, after strings are translated, Dolphin will ask you to review the result to approve or ask the agent to refine. By default, this mode is not enabled.

#### globalContext

The context of the translation. It will be used to provide more information to the translator.

> For example, if you don't want specific words to skipped, you can say "xxx is a specific term which should be translated."

#### id

Arbitary unique id across localizations, used to identify the specific localization in the project.

#### format

- **text**: Plain text
- **json**: JSON file, usually used in frontend apps
- **xliff**: Xliff file
- **strings**: Apple Localized Strings (with `"key" = "value"` format)
- **xloc**: Xcode Localization Catalog
- **xcode**: Xcode project (Using Xcode built-in localization tool to import/export strings)

#### path

The path to the localization file. You can use `${LANGUAGE}` as the language placeholder.

> For Xcode format, the path should be `.xcodeproj` folder.

#### languages

The target languages to translate to.

## Examples

For more examples, please check the [Examples](https://github.com/icodesign/dolphin/tree/main/examples/) repo.

## Troubleshooting

### Logs

By default, shell wil only show the major output. To see more details, you can check the log file at `~/Library/Logs/Dolphin/dolphin-[date].log`. The log directory will also be printed at the top of the shell output.

### Exported Strings

Dolphin will export the translated strings to the `.dolphin` folder in the same directory of the configuration file. You can check if the exported strings are correct there.
