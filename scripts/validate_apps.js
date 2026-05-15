const path = require('path')
const yaml = require('yaml')
const fs = require('fs-extra')

// Define paths.
const PUBLIC_FOLDER = path.join(__dirname, '..', 'public')
const VERSION_FOLDER = path.join(PUBLIC_FOLDER, 'v4')
const DIST_VERSION_FOLDER = path.join(__dirname, '..', 'dist', 'v4')
const SETUP_TIME_BUILTINS_REGEX = /\$\$cap_(appname|root_domain)/

/**
 * Check apps in the folder.
 */
async function checkApps() {
    try {
        const appFiles = await fs.readdir(path.join(VERSION_FOLDER, 'apps'))
        const validApps = appFiles.filter((file) => file.endsWith('.yml'))

        if (validApps.length !== appFiles.length) {
            throw new Error('Hey! Everything in v4 needs that .yml extension.')
        }

        for (const appFile of validApps) {
            await checkAppFile(appFile)
            console.log(`App ${appFile} looking good!`)
        }
    } catch (err) {
        console.error(err)
        process.exit(127)
    }
}

/**
 * Check a single application file.
 * @param {string} appFile The application file name to check.
 */
async function checkAppFile(appFile) {
    const filePath = path.join(VERSION_FOLDER, 'apps', appFile)
    const content = yaml.parse(await fs.readFile(filePath, 'utf-8'))
    validateAppContent(appFile, content)
    await checkLogo(appFile)
    await checkDistApp(appFile, content)
}

/**
 * Validate the contents of an application configuration.
 * @param {string} appName The application's name.
 * @param {Object} content The application configuration content.
 */
function validateAppContent(appName, content) {
    if (!content.caproverOneClickApp) {
        throw new Error(`Missing caproverOneClickApp for ${appName}`)
    }

    const { description, instructions } = content.caproverOneClickApp

    if (!description) {
        throw new Error(`Missing description for ${appName}`)
    }

    if (description.length > 200) {
        throw new Error(
            `Description too long for ${appName} - keep it under 200 characters`
        )
    }

    if (!instructions || !instructions.start || !instructions.end) {
        throw new Error(
            `Missing instructions.start or instructions.end for ${appName}`
        )
    }

    validateSetupTimeFields(appName, content)

    if (!content.services) {
        throw new Error(`Missing services for ${appName}`)
    }
}

/**
 * CapRover does not expand $$cap_appname or $$cap_root_domain in the setup UI.
 * They are safe in services and final instructions, but not in variable fields
 * or instructions.start, which users see before deployment.
 * @param {string} appName The application's name.
 * @param {Object} content The application configuration content.
 */
function validateSetupTimeFields(appName, content) {
    const { instructions } = content.caproverOneClickApp
    const variables = Array.isArray(content.caproverOneClickApp.variables)
        ? content.caproverOneClickApp.variables
        : []
    if (SETUP_TIME_BUILTINS_REGEX.test(instructions.start)) {
        throw new Error(
            `instructions.start for ${appName} must not contain $$cap_appname or $$cap_root_domain`
        )
    }

    const serviceText = JSON.stringify(content.services || {})
    for (const variable of variables) {
        for (const field of ['label', 'description', 'defaultValue']) {
            if (
                typeof variable[field] === 'string' &&
                SETUP_TIME_BUILTINS_REGEX.test(variable[field])
            ) {
                throw new Error(
                    `${field} for ${variable.id} in ${appName} must not contain $$cap_appname or $$cap_root_domain`
                )
            }
        }

        if (
            typeof variable.defaultValue === 'string' &&
            variable.defaultValue.includes('"') &&
            serviceText.includes(variable.id)
        ) {
            throw new Error(
                `defaultValue for ${variable.id} in ${appName} contains raw quotes and is substituted into services; this can break CapRover JSON parsing`
            )
        }
    }
}

/**
 * Check for the existence of the logo associated with an app.
 * @param {string} appFile The application file name.
 */
async function checkLogo(appFile) {
    const logoFile = appFile.replace('.yml', '')
    const logoPath = path.join(VERSION_FOLDER, 'logos', `${logoFile}.png`)

    if (
        !(await fs.pathExists(logoPath)) ||
        !(await fs.stat(logoPath)).isFile()
    ) {
        throw new Error(`Missing logo for ${appFile}: ${logoPath}`)
    }

    const distLogoPath = path.join(
        DIST_VERSION_FOLDER,
        'logos',
        `${logoFile}.png`
    )
    if (await fs.pathExists(distLogoPath)) {
        const [sourceLogo, distLogo] = await Promise.all([
            fs.readFile(logoPath),
            fs.readFile(distLogoPath),
        ])
        if (!sourceLogo.equals(distLogo)) {
            throw new Error(
                `Stale dist logo for ${appFile}: run pnpm run build`
            )
        }
    }
}

/**
 * Check generated dist app payload freshness when dist exists locally.
 * @param {string} appFile The application file name.
 * @param {Object} content The parsed source application configuration.
 */
async function checkDistApp(appFile, content) {
    const appName = appFile.replace('.yml', '')
    const distAppPath = path.join(DIST_VERSION_FOLDER, 'apps', appName)
    if (!(await fs.pathExists(distAppPath))) {
        return
    }

    const distContent = await fs.readJson(distAppPath)
    if (JSON.stringify(content) !== JSON.stringify(distContent)) {
        throw new Error(`Stale dist app for ${appFile}: run pnpm run build`)
    }
}

// Start the checking process.
checkApps()
