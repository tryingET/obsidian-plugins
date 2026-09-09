Feature: Frozen native LayerManager evaluator before optimization
  The evaluator is controller-owned, not candidate-editable acceptance truth.
  These Gherkin scenarios specify acceptance; Vitest tests cover pure boundaries.
  Native execution receipts are required separately. This is not a Cucumber runner.

  Scenario: Admit only a newly owned disposable native host
    Given a fresh profile and vault under admitted heavy-job scratch
    And a pinned Obsidian binary, Excalidraw release and generated LayerManager script
    When the live PID, start time, profile, page, vault realpath, nonce and script hash agree
    Then the exact host may execute the 1000-element pilot
    But a personal vault, stale page, changed hash or unreadable identity is rejected

  Scenario: Remove owned startup Settings interference without relaxing input focus
    Given the disposable host identity was independently verified
    And its native window inventory contains only the drawing and one same-renderer Settings window
    When startup preparation closes that exact Settings window and observes its destruction
    Then the drawing window alone remains before focus and measurement
    But unknown windows or a prevented close fail without a destroy fallback
    And any focus or visibility transition during measurement still rejects the sample

  Scenario: Resolve a timeout without replaying indeterminate effects
    Given one native mutation has been dispatched
    When its response times out or the native page disconnects
    Then the run is failed and its raw in-flight record is retained
    And no further mutation is dispatched on that host
    And exact owned process shutdown is independently reconciled
    And an ambiguous cleanup result never says the host stopped

  Scenario Outline: Progressively admit scene size and grouping cells
    Given the native 1000-element semantic and synchronization pilot passes
    And every predecessor size and required oracle passes within resource limits
    When the frozen size <size> and shape <shape> are measured serially
    Then fixture loading is separate from operation timing
    And scene order, membership, geometry and foreign metadata are preserved
    And UI row identities, selection and external-change freshness are exact
    And input path, promise completion, semantic settlement and two render opportunities are distinct
    And long tasks, frame gaps, memory snapshots, failures and all sample counts are retained
    But render opportunities are not called display presentation or physical-input latency
    Examples:
      | size   | shape     |
      | 1000   | ungrouped |
      | 10000  | pairs     |
      | 50000  | ten       |
      | 100000 | giant     |
      | 100000 | nested8   |
      | 100000 | skewed    |
    # Actual contract requires the full Cartesian matrix, not only these examples.

  Scenario Outline: Reject faster-by-doing-less mutants
    Given an independently expected native operation result
    When the evaluator encounters a deliberate <mutant> mutant
    Then the evaluator rejects the run before aggregation
    And the original failing evidence is retained
    Examples:
      | mutant       |
      | no-op        |
      | dropped-row  |
      | stale-cache  |
      | check-bypass |

  Scenario: Unchanged calibration cannot win
    Given three training seeds as independent matched baseline and calibration process blocks
    And every timing block has two retained warmups and eight measured subsamples
    And both semantic holdout seeds cover every admitted size and grouping
    When the source or installed script hash is unchanged
    Then no improvement can be selected regardless of its timing
    And changed candidates require a practical gain beyond measured noise
    And every required cell remains correctness and non-regression gated

  Scenario: Clock quantization does not create a global percentage-noise veto
    Given input is phase-aligned after a native render opportunity
    And input-sync changes from 0.1 milliseconds to 0.2 milliseconds
    When the change is inside the frozen 1 millisecond practical floor
    Then it does not inflate another workload's primary noise threshold
    But a required control outside its own hybrid band remains inconclusive
    And a candidate cannot enlarge any budget with a coarser reported clock

  Scenario: A lucky training cell is not an overall win
    Given a fixed equal-weight large-canvas UI aggregate
    When only one cell becomes faster or a behavior-identical script is rebuilt
    Then the evaluator cannot select that as an overall improvement
    And a material aggregate signal still requires fresh held-out timing confirmation
    And semantic holdouts are never presented as held-out timing proof

  Scenario: Complete only after native evidence exists
    Given synthetic evaluator tests are green
    But the native pilot or any required matrix or semantic proof is absent
    When task closure readiness is checked
    Then task 5583 is not reported completed
    And no Node proxy is substituted for missing native evidence
