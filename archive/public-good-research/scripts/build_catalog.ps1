[CmdletBinding()]
param(
    [string]$DpgApiUrl = 'https://app.digitalpublicgoods.net/api/v1/dpgs',

    [string]$OutputRoot = (Join-Path $PSScriptRoot '..')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-GitHubSlug {
    param([string]$Url)

    if ([string]::IsNullOrWhiteSpace($Url)) {
        return $null
    }

    if ($Url -notmatch '^https?://github\.com/([^/]+)/([^/#?]+)') {
        return $null
    }

    $owner = $Matches[1]
    $repository = $Matches[2] -replace '\.git$', ''
    if ([string]::IsNullOrWhiteSpace($owner) -or [string]::IsNullOrWhiteSpace($repository)) {
        return $null
    }

    return "$owner/$repository"
}

function Invoke-GitHubGraphQL {
    param([string]$Query)

    $raw = & gh api graphql -f "query=$Query"
    if ($LASTEXITCODE -ne 0 -and @($raw).Count -eq 0) {
        throw 'GitHub GraphQL query failed.'
    }
    return (($raw -join "`n") | ConvertFrom-Json -Depth 100)
}

function Get-Domain {
    param([int[]]$Sdgs)

    if ($Sdgs -contains 3) { return '健康与福祉' }
    if ($Sdgs -contains 4) { return '教育与知识' }
    if ($Sdgs -contains 2) { return '农业与粮食' }
    if ($Sdgs -contains 6) { return '水与卫生' }
    if (($Sdgs -contains 7) -or ($Sdgs -contains 12) -or ($Sdgs -contains 13) -or ($Sdgs -contains 14) -or ($Sdgs -contains 15)) { return '气候与环境' }
    if ($Sdgs -contains 16) { return '公共治理' }
    if (($Sdgs -contains 1) -or ($Sdgs -contains 5) -or ($Sdgs -contains 8) -or ($Sdgs -contains 10)) { return '包容与生计' }
    if ($Sdgs -contains 11) { return '城市与社区' }
    return '公共数字基础设施'
}

function Get-RiskLevel {
    param(
        [string]$Domain,
        [string]$Name,
        [string]$Description
    )

    $text = "$Name $Description".ToLowerInvariant()
    if ($Domain -eq '健康与福祉') { return '高' }
    if ($text -match 'identity|payment|financial|medical|patient|clinical|government|election|credential|child|children') { return '高' }
    if ($Domain -in @('教育与知识', '农业与粮食', '公共治理', '包容与生计')) { return '中' }
    return '低'
}

function Get-RepositoryScore {
    param($Repository)

    $score = 0
    $pushedAt = [datetimeoffset]$Repository.pushedAt
    $ageDays = ([datetimeoffset]::UtcNow - $pushedAt).TotalDays

    if ($ageDays -le 90) { $score += 40 }
    elseif ($ageDays -le 365) { $score += 30 }
    elseif ($ageDays -le 730) { $score += 20 }
    elseif ($ageDays -le 1460) { $score += 8 }

    $issueCount = [int]$Repository.issues.totalCount
    if ($issueCount -ge 100) { $score += 25 }
    elseif ($issueCount -ge 20) { $score += 20 }
    elseif ($issueCount -ge 5) { $score += 15 }
    elseif ($issueCount -ge 1) { $score += 8 }

    $stars = [int]$Repository.stargazerCount
    if ($stars -ge 1000) { $score += 10 }
    elseif ($stars -ge 100) { $score += 7 }
    elseif ($stars -ge 10) { $score += 4 }

    if ($null -ne $Repository.licenseInfo -and -not [string]::IsNullOrWhiteSpace($Repository.licenseInfo.spdxId)) {
        $score += 10
    }
    if ($null -ne $Repository.primaryLanguage) {
        $score += 5
    }

    return $score
}

function Get-IssueScore {
    param($Issue)

    $score = 0
    $labels = @($Issue.labels.nodes | ForEach-Object { $_.name.ToLowerInvariant() })
    if ($labels -contains 'good first issue') { $score += 120 }
    if ($labels -contains 'help wanted') { $score += 100 }
    if (@($labels | Where-Object { $_ -match 'accessib|a11y' }).Count -gt 0) { $score += 90 }
    if (@($labels | Where-Object { $_ -match 'document|docs' }).Count -gt 0) { $score += 70 }
    if (@($labels | Where-Object { $_ -match '^bug$|type: bug|kind/bug' }).Count -gt 0) { $score += 60 }
    if (@($labels | Where-Object { $_ -match 'test' }).Count -gt 0) { $score += 40 }

    $ageDays = ([datetimeoffset]::UtcNow - [datetimeoffset]$Issue.updatedAt).TotalDays
    if ($ageDays -le 30) { $score += 20 }
    elseif ($ageDays -le 180) { $score += 15 }
    elseif ($ageDays -le 730) { $score += 8 }

    if ($Issue.title.Length -le 120) { $score += 5 }
    if ($Issue.title -match '(?i)\bfix\b|\badd\b|implement|support|update|document|test|error|fail|crash|refactor|translat|accessib|a11y') { $score += 25 }
    if ($Issue.title -match '(?i)security|vulnerability|\bCVE\b|release|roadmap|tracking issue|epic') { $score -= 200 }
    return $score
}

function Test-IssueAllowed {
    param($Issue)

    $labels = @($Issue.labels.nodes | ForEach-Object { $_.name.ToLowerInvariant() })
    if (@($labels | Where-Object { $_ -match 'security|vulnerab|private|confidential|duplicate|invalid|question' }).Count -gt 0) {
        return $false
    }
    if ($Issue.title -match '(?i)security|vulnerability|\bCVE\b|release|roadmap|tracking issue|\bepic\b|partnering|new issue|support request|general question') {
        return $false
    }
    return $true
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw 'GitHub CLI (gh) is required.'
}
if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) {
    throw 'curl.exe is required.'
}

$rawRegistry = & curl.exe -L --retry 3 --retry-delay 2 -sS --max-time 90 $DpgApiUrl
if ($LASTEXITCODE -ne 0 -or @($rawRegistry).Count -eq 0) {
    throw "Failed to download current DPGA registry: $DpgApiUrl"
}
$currentRegistry = @(($rawRegistry -join "`n") | ConvertFrom-Json -Depth 100)

$registryItems = foreach ($item in $currentRegistry) {
    if ($item.status -ne 'DPG' -or $item.category -ne 'Open Software') {
        continue
    }
    $slug = Get-GitHubSlug -Url $item.sourceURL
    if ($null -eq $slug) {
        continue
    }

    [pscustomobject]@{
        DpgId = $item.dpgId
        Name = $item.name
        Description = ($item.description -replace '\s+', ' ').Trim()
        Website = $item.websiteURL
        RegistryStage = $item.status
        RegistryUrl = $item.publicURL
        DeclaredLicense = @($item.openLicense) -join '|'
        Sdgs = @($item.sdgs | ForEach-Object { [int]$_.number })
        GitHubSlug = $slug
    }
}

$registryItems = @($registryItems | Group-Object GitHubSlug | ForEach-Object { $_.Group | Select-Object -First 1 })

$repositoryMetadata = @{}
$batchSize = 35
for ($offset = 0; $offset -lt $registryItems.Count; $offset += $batchSize) {
    $batch = @($registryItems | Select-Object -Skip $offset -First $batchSize)
    $fragments = [System.Collections.Generic.List[string]]::new()
    $aliasMap = @{}

    for ($index = 0; $index -lt $batch.Count; $index++) {
        $alias = "r$index"
        $parts = $batch[$index].GitHubSlug.Split('/', 2)
        $owner = $parts[0].Replace('"', '\"')
        $repository = $parts[1].Replace('"', '\"')
        $aliasMap[$alias] = $batch[$index].GitHubSlug
        $fragments.Add("$alias`: repository(owner: `"$owner`", name: `"$repository`") { nameWithOwner url description isArchived isDisabled isPrivate isFork pushedAt updatedAt stargazerCount forkCount hasIssuesEnabled defaultBranchRef { name target { ... on Commit { oid } } } issues(states: OPEN) { totalCount } pullRequests(states: OPEN) { totalCount } licenseInfo { spdxId } primaryLanguage { name } repositoryTopics(first: 10) { nodes { topic { name } } } }")
    }

    $query = "query {`n$($fragments -join "`n")`n}"
    $response = Invoke-GitHubGraphQL -Query $query
    foreach ($alias in $aliasMap.Keys) {
        $repository = $response.data.$alias
        if ($null -ne $repository) {
            $repositoryMetadata[$aliasMap[$alias]] = $repository
        }
    }
}

$eligible = foreach ($item in $registryItems) {
    if (-not $repositoryMetadata.ContainsKey($item.GitHubSlug)) {
        continue
    }
    $repository = $repositoryMetadata[$item.GitHubSlug]
    if ($repository.isArchived -or $repository.isDisabled -or $repository.isPrivate -or -not $repository.hasIssuesEnabled) {
        continue
    }
    if ($null -eq $repository.pushedAt) {
        continue
    }
    if ([datetimeoffset]$repository.pushedAt -lt [datetimeoffset]::UtcNow.AddYears(-2)) {
        continue
    }
    if ([int]$repository.issues.totalCount -lt 1) {
        continue
    }

    [pscustomobject]@{
        Registry = $item
        Repository = $repository
        Score = (Get-RepositoryScore -Repository $repository) + $(if ($item.RegistryStage -eq 'DPG') { 5 } else { 0 })
    }
}

$sortRules = @(
    @{Expression='Score';Descending=$true},
    @{Expression={$_.Repository.pushedAt};Descending=$true},
    @{Expression={$_.Registry.Name};Descending=$false}
)
$preselected = @($eligible | Sort-Object $sortRules | Select-Object -First 130)
if ($preselected.Count -lt 100) {
    throw "Expected at least 100 eligible projects, found $($preselected.Count)."
}

$issueCandidates = @{}
for ($offset = 0; $offset -lt $preselected.Count; $offset += 20) {
    $batch = @($preselected | Select-Object -Skip $offset -First 20)
    $fragments = [System.Collections.Generic.List[string]]::new()
    $aliasMap = @{}

    for ($index = 0; $index -lt $batch.Count; $index++) {
        $alias = "r$index"
        $parts = $batch[$index].Repository.nameWithOwner.Split('/', 2)
        $owner = $parts[0].Replace('"', '\"')
        $repository = $parts[1].Replace('"', '\"')
        $slug = $batch[$index].Repository.nameWithOwner
        $aliasMap[$alias] = $slug
        $fragments.Add("$alias`: repository(owner: `"$owner`", name: `"$repository`") { issues(first: 20, states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes { number title url updatedAt labels(first: 20) { nodes { name } } } } }")
    }

    $query = "query {`n$($fragments -join "`n")`n}"
    $response = Invoke-GitHubGraphQL -Query $query
    foreach ($alias in $aliasMap.Keys) {
        $issues = @($response.data.$alias.issues.nodes | Where-Object { Test-IssueAllowed -Issue $_ })
        $issueCandidates[$aliasMap[$alias]] = @($issues | Sort-Object @{Expression={ Get-IssueScore -Issue $_ };Descending=$true}, @{Expression='updatedAt';Descending=$true})
    }
}

$selected = @($preselected | Where-Object { @($issueCandidates[$_.Repository.nameWithOwner]).Count -gt 0 } | Select-Object -First 100)
if ($selected.Count -ne 100) {
    throw "Expected 100 projects with safe candidate issues, found $($selected.Count)."
}

$projects = [System.Collections.Generic.List[object]]::new()
$tasks = [System.Collections.Generic.List[object]]::new()

for ($index = 0; $index -lt $selected.Count; $index++) {
    $entry = $selected[$index]
    $registry = $entry.Registry
    $repository = $entry.Repository
    $projectId = 'P{0:D3}' -f ($index + 1)
    $domain = Get-Domain -Sdgs $registry.Sdgs
    $risk = Get-RiskLevel -Domain $domain -Name $registry.Name -Description $registry.Description
    $issues = @($issueCandidates[$repository.nameWithOwner])
    $candidateIssue = $issues | Select-Object -First 1

    if ($null -eq $candidateIssue) {
        $issueTitle = '维护者接入后选择首个可复现的公开 Issue'
        $issueUrl = $repository.url + '/issues'
        $issueNumber = ''
        $issueLabels = ''
    } else {
        $issueTitle = ($candidateIssue.title -replace '\s+', ' ').Trim()
        $issueUrl = $candidateIssue.url
        $issueNumber = $candidateIssue.number
        $issueLabels = @($candidateIssue.labels.nodes | ForEach-Object { $_.name }) -join '|'
    }

    $project = [pscustomobject]@{
        project_id = $projectId
        project_name = $registry.Name
        domain = $domain
        public_value = $registry.Description
        sdgs = $registry.Sdgs -join '|'
        registry_url = $registry.RegistryUrl
        repository = $repository.nameWithOwner
        repository_url = $repository.url
        website = $registry.Website
        registry_status = $registry.RegistryStage
        source_license = $registry.DeclaredLicense
        github_license = if ($null -ne $repository.licenseInfo) { $repository.licenseInfo.spdxId } else { '' }
        primary_language = if ($null -ne $repository.primaryLanguage) { $repository.primaryLanguage.name } else { '' }
        last_push = ([datetimeoffset]$repository.pushedAt).ToString('yyyy-MM-dd')
        open_issues = [int]$repository.issues.totalCount
        stars = [int]$repository.stargazerCount
        readiness_score = [int]$entry.Score
        risk_level = $risk
        candidate_issue_number = $issueNumber
        candidate_issue_title = $issueTitle
        candidate_issue_url = $issueUrl
        candidate_issue_labels = $issueLabels
        activation_status = '待维护者确认'
    }
    $projects.Add($project)

    $commonSafety = if ($risk -eq '高') {
        '仅使用公开测试数据；禁止诊断、治疗、身份、支付或生产数据操作；需要维护者和领域专家双重批准。'
    } elseif ($risk -eq '中') {
        '仅修改任务授权范围；禁止访问真实个人数据；需要维护者批准后才能向上游提交。'
    } else {
        '仅修改任务授权范围；禁止携带密钥和个人数据；需要维护者批准后才能向上游提交。'
    }

    $tasks.Add([pscustomobject]@{
        task_id = "$projectId-A"
        project_id = $projectId
        project_name = $registry.Name
        phase = 'A-复现与验收固化'
        depends_on = ''
        candidate_issue = $issueTitle
        issue_url = $issueUrl
        goal = "在固定 commit 上复现候选 Issue，并把需求收敛为模型可执行、可自动判定的任务说明。"
        deliverables = 'task-spec.md；最小复现；失败测试或确定性检查脚本；准确运行命令。'
        acceptance = '干净环境可重复得到预期失败；验收命令和期望结果明确；不修改生产实现；维护者确认任务边界。'
        model_use = '可让模型分析仓库、生成复现步骤和测试，但不得让模型自行扩大需求范围。'
        risk_control = $commonSafety
        status = '待维护者确认'
    })
    $tasks.Add([pscustomobject]@{
        task_id = "$projectId-B"
        project_id = $projectId
        project_name = $registry.Name
        phase = 'B-模型实现最小修复'
        depends_on = "$projectId-A"
        candidate_issue = $issueTitle
        issue_url = $issueUrl
        goal = '基于 A 阶段锁定的任务说明和失败测试，使用模型完成最小范围实现。'
        deliverables = 'model.patch；变更说明；目标测试与相关回归测试日志；模型与运行参数记录。'
        acceptance = 'A 阶段失败测试转为通过；相关既有测试无回归；无无关重构、依赖或格式化；补丁不含密钥和个人数据。'
        model_use = '模型只能在隔离容器和固定 commit 上工作；禁用自动发布、自动合并和生产凭据。'
        risk_control = $commonSafety
        status = '等待A完成'
    })
    $tasks.Add([pscustomobject]@{
        task_id = "$projectId-C"
        project_id = $projectId
        project_name = $registry.Name
        phase = 'C-独立复验与草稿PR'
        depends_on = "$projectId-B"
        candidate_issue = $issueTitle
        issue_url = $issueUrl
        goal = '由不同用户在干净环境独立复验补丁，检查回归、许可证、敏感信息和提交质量，并准备草稿 PR。'
        deliverables = 'review.md；干净环境复验日志；风险清单；草稿 PR 标题与正文；维护者决定记录。'
        acceptance = '补丁可重复应用；目标与必要回归测试通过；敏感信息扫描通过；变更符合贡献指南；只有维护者批准后才创建草稿 PR。'
        model_use = '模型可辅助审查和撰写 PR，但最终结论必须由未参与 B 阶段的用户确认。'
        risk_control = $commonSafety
        status = '等待B完成'
    })
}

$resolvedOutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
$dataDirectory = Join-Path $resolvedOutputRoot 'data'
[System.IO.Directory]::CreateDirectory($dataDirectory) | Out-Null

$projectCsv = Join-Path $dataDirectory '100个公益开源项目.csv'
$taskCsv = Join-Path $dataDirectory '300个用户认领任务.csv'
$projects | Export-Csv -LiteralPath $projectCsv -NoTypeInformation -Encoding utf8
$tasks | Export-Csv -LiteralPath $taskCsv -NoTypeInformation -Encoding utf8

$markdownPath = Join-Path $resolvedOutputRoot '100个公益开源项目认领手册.md'
$markdown = [System.Text.StringBuilder]::new()
[void]$markdown.AppendLine('# 100 个公益开源项目认领手册')
[void]$markdown.AppendLine()
[void]$markdown.AppendLine('生成日期：2026-08-24')
[void]$markdown.AppendLine()
[void]$markdown.AppendLine('这是一份接入候选清单，不构成向上游仓库自动提交代码的授权。100 个项目全部来自 Digital Public Goods Alliance（DPGA）当前 Registry 中已认证的 Open Software，并经过 GitHub 仓库状态核验。每个项目必须取得维护者确认后，任务才可从“候选”变为“可认领”。')
[void]$markdown.AppendLine()
[void]$markdown.AppendLine('## 准入标准')
[void]$markdown.AppendLine()
[void]$markdown.AppendLine('- 公共价值：与联合国可持续发展目标相关，并能说明明确受益对象。')
[void]$markdown.AppendLine('- 开放性：具有明确开源许可证、公开代码仓库和清晰所有权。')
[void]$markdown.AppendLine('- 可协作性：仓库未归档、Issue 功能开启，并能固定 commit、运行测试或建立确定性验收。')
[void]$markdown.AppendLine('- 安全性：首批任务不接触真实个人数据、生产凭据或敏感基础设施，不允许模型自动部署或自动合并。')
[void]$markdown.AppendLine('- 维护者授权：只有维护者确认候选 Issue、任务边界和贡献方式后，才允许创建上游草稿 PR。')
[void]$markdown.AppendLine()
[void]$markdown.AppendLine('## 统一拆分方式')
[void]$markdown.AppendLine()
[void]$markdown.AppendLine('| 阶段 | 可认领工作 | 核心交付物 | 解锁条件 |')
[void]$markdown.AppendLine('|---|---|---|---|')
[void]$markdown.AppendLine('| A | 复现问题并固化验收 | 任务说明、最小复现、失败测试或检查脚本 | 维护者确认边界 |')
[void]$markdown.AppendLine('| B | 使用模型完成最小修复 | Patch、变更说明、测试日志、模型运行记录 | A 验收通过 |')
[void]$markdown.AppendLine('| C | 独立复验并准备草稿 PR | 审查报告、复验日志、风险清单、PR 文案 | B 验收通过 |')
[void]$markdown.AppendLine()
[void]$markdown.AppendLine('平台应采用租约和固定基线：用户领取时锁定仓库 commit；任务超时自动回收；B 与 C 必须由不同用户完成；服务端在干净容器独立运行验收；客户端自报结果不直接计分。')
[void]$markdown.AppendLine()
[void]$markdown.AppendLine('## 项目与首批任务')

foreach ($project in $projects) {
    $issueLabel = $project.candidate_issue_title.Replace('[', '\[').Replace(']', '\]')
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("### $($project.project_id) · $($project.project_name)")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("- 公益领域：$($project.domain)；SDG：$($project.sdgs)；风险：$($project.risk_level)；DPGA 状态：$($project.registry_status)")
    [void]$markdown.AppendLine("- 公益价值：$($project.public_value)")
    [void]$markdown.AppendLine("- 仓库：[$($project.repository)]($($project.repository_url))；许可证：来源记录 ``$($project.source_license)`` / GitHub ``$($project.github_license)``；主要语言：$($project.primary_language)")
    [void]$markdown.AppendLine("- 活跃度：最后推送 $($project.last_push)；开放 Issue $($project.open_issues)；GitHub Star $($project.stars)；就绪分 $($project.readiness_score)")
    [void]$markdown.AppendLine("- 候选需求：[$issueLabel]($($project.candidate_issue_url))")
    [void]$markdown.AppendLine("- ``$($project.project_id)-A``：复现候选需求，提交任务说明、最小复现和失败测试；验收后解锁 B。")
    [void]$markdown.AppendLine("- ``$($project.project_id)-B``：在固定 commit 的隔离环境使用模型实现最小补丁；A 的失败测试必须转为通过且无相关回归。")
    [void]$markdown.AppendLine("- ``$($project.project_id)-C``：由另一名用户独立复验、完成敏感信息和许可证检查，并在维护者批准后准备草稿 PR。")
}

[void]$markdown.AppendLine()
[void]$markdown.AppendLine('## 数据来源与时效')
[void]$markdown.AppendLine()
[void]$markdown.AppendLine('- 公益身份与项目说明：[DPGA Registry](https://www.digitalpublicgoods.net/registry) 与 [当前 Registry API](https://app.digitalpublicgoods.net/api/v1/dpgs)。')
[void]$markdown.AppendLine('- 准入原则：[Digital Public Goods Standard](https://www.digitalpublicgoods.net/standard)。')
[void]$markdown.AppendLine('- 仓库、许可证、活跃度和 Issue：[GitHub 官方 GraphQL API](https://docs.github.com/en/graphql)。')
[void]$markdown.AppendLine('- 分布式认领机制参考：[分布式雷达](https://deng.codexradar.com/cn?harness=codex) 与 [DRadar 客户端](https://github.com/codex-radar/dradar)。')
[void]$markdown.AppendLine()
[void]$markdown.AppendLine('Issue、默认分支和仓库活跃度会变化。项目正式接入时必须重新读取 Issue、锁定 commit，并由维护者确认候选需求仍然有效。')

[System.IO.File]::WriteAllText($markdownPath, $markdown.ToString(), [System.Text.UTF8Encoding]::new($false))

[pscustomobject]@{
    projects = $projects.Count
    tasks = $tasks.Count
    project_csv = $projectCsv
    task_csv = $taskCsv
    handbook = $markdownPath
} | ConvertTo-Json
