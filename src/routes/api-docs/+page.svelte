<script lang="ts">
	import { onMount } from 'svelte';

	type SwaggerBundle = ((config: Record<string, unknown>) => unknown) & {
		presets: { apis: unknown };
	};
	type SwaggerWindow = {
		SwaggerUIBundle: SwaggerBundle;
		SwaggerUIStandalonePreset: unknown;
	};

	onMount(() => {
		// SwaggerUIBundle e SwaggerUIStandalonePreset são injetados via CDN
		const w = window as unknown as SwaggerWindow;
		const ui = w.SwaggerUIBundle;
		const preset = w.SwaggerUIStandalonePreset;

		ui({
			url: '/openapi.json',
			dom_id: '#swagger-ui',
			presets: [ui.presets.apis, preset],
			layout: 'StandaloneLayout',
			deepLinking: true,
			tryItOutEnabled: true
		});
	});
</script>

<svelte:head>
	<title>API Docs — On Time</title>
	<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
	<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
	<script
		src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js"
	></script>
</svelte:head>

<div id="swagger-ui"></div>
